-- ============================================================
--  OperWiki AI Platform — Database Schema
--  PostgreSQL 16
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- trigram search

-- ── Roles / Users ──────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('reader', 'contributor', 'reviewer', 'admin');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  azure_oid     VARCHAR(100) UNIQUE,               -- Azure AD Object ID
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(255) NOT NULL,
  role          user_role NOT NULL DEFAULT 'reader',
  avatar_url    VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ── Document Categories ────────────────────────────────────
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES categories(id),
  icon        VARCHAR(50),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (name, slug, description, icon, sort_order) VALUES
  ('IT Infrastructure',    'it-infrastructure',    'Servers, networking, cloud',  'server',    1),
  ('Operational Processes','ops-processes',         'Runbooks and SOPs',           'workflow',  2),
  ('Application Support',  'app-support',           'App-specific guides',         'code',      3),
  ('Citrix',               'citrix',                'Citrix environment docs',     'monitor',   4),
  ('Monitoring',           'monitoring',            'Monitoring & alerting',       'activity',  5),
  ('Security',             'security',              'Security procedures',         'shield',    6);

-- ── Documents ──────────────────────────────────────────────
CREATE TYPE doc_status AS ENUM ('draft', 'in_review', 'approved', 'archived', 'deprecated');

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(500) NOT NULL,
  slug            VARCHAR(500) UNIQUE NOT NULL,
  category_id     UUID REFERENCES categories(id),
  status          doc_status NOT NULL DEFAULT 'draft',
  current_version INT NOT NULL DEFAULT 1,
  owner_id        UUID REFERENCES users(id),
  mediawiki_id    VARCHAR(100),    -- original wiki page ID if migrated
  mediawiki_title VARCHAR(500),    -- original wiki title
  tags            TEXT[],
  ai_metadata     JSONB,           -- AI-generated metadata, freshness score, etc.
  vector_id       VARCHAR(100),    -- Qdrant vector point ID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_title_trgm ON documents USING GIN(title gin_trgm_ops);

-- ── Document Versions ──────────────────────────────────────
CREATE TABLE document_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  content_md      TEXT NOT NULL,        -- Markdown content
  content_html    TEXT,                 -- Rendered HTML (cached)
  change_summary  TEXT,                 -- Human/AI summary of changes
  ai_generated    BOOLEAN DEFAULT FALSE,
  author_id       UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, version)
);

CREATE INDEX idx_doc_versions_document ON document_versions(document_id);

-- ── Change Requests ────────────────────────────────────────
CREATE TYPE cr_status AS ENUM ('pending', 'ai_processing', 'in_review', 'approved', 'rejected', 'merged');
CREATE TYPE cr_source AS ENUM ('manual', 'ms_forms', 'servicenow', 'ai_suggestion', 'api');

CREATE TABLE change_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_number  VARCHAR(20) UNIQUE NOT NULL,  -- e.g. CR-2025-0001
  title             VARCHAR(500) NOT NULL,
  description       TEXT NOT NULL,
  change_type       VARCHAR(100),                 -- 'infrastructure_update', 'process_change', etc.
  affected_systems  TEXT[],
  source            cr_source NOT NULL DEFAULT 'manual',
  external_ref      VARCHAR(255),                 -- MS Forms submission ID / ServiceNow number
  status            cr_status NOT NULL DEFAULT 'pending',
  submitted_by      UUID REFERENCES users(id),
  assigned_reviewer UUID REFERENCES users(id),
  ai_analysis       JSONB,                        -- AI-identified affected docs, proposed changes
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_cr_status ON change_requests(status);
CREATE INDEX idx_cr_systems ON change_requests USING GIN(affected_systems);

-- ── Change Request ↔ Document Links ────────────────────────
CREATE TABLE cr_document_changes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cr_id           UUID NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id),
  proposed_content TEXT NOT NULL,    -- AI-proposed new markdown
  diff_html        TEXT,             -- Rendered diff
  ai_explanation   TEXT,             -- AI explanation of the changes
  status           cr_status NOT NULL DEFAULT 'pending',
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  reviewer_notes   TEXT
);

-- ── Review Comments / Discussions ─────────────────────────
CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES documents(id),
  cr_id       UUID REFERENCES change_requests(id),
  parent_id   UUID REFERENCES comments(id),
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  section_ref VARCHAR(255),    -- markdown anchor / line reference
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit Log ──────────────────────────────────────────────
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,  -- 'doc.publish', 'cr.approve', 'doc.edit', etc.
  entity_type VARCHAR(50),
  entity_id   UUID,
  metadata    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);

-- ── AI Freshness Flags ─────────────────────────────────────
CREATE TABLE freshness_flags (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  issue_type    VARCHAR(100) NOT NULL,  -- 'outdated_reference', 'missing_section', 'conflict', etc.
  description   TEXT NOT NULL,
  severity      VARCHAR(20) DEFAULT 'medium',  -- low | medium | high
  status        VARCHAR(20) DEFAULT 'open',    -- open | resolved | dismissed
  ai_confidence FLOAT,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- ── Notification Queue ─────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(100) NOT NULL,
  title       VARCHAR(500) NOT NULL,
  body        TEXT,
  link        VARCHAR(500),
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed: Local Dev Admin User ─────────────────────────────
INSERT INTO users (email, display_name, role) VALUES
  ('admin@operwiki.local', 'Local Admin', 'admin'),
  ('reviewer@operwiki.local', 'Reviewer User', 'reviewer'),
  ('contributor@operwiki.local', 'Contributor User', 'contributor');

-- Helper function: update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_change_requests_updated_at
  BEFORE UPDATE ON change_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
