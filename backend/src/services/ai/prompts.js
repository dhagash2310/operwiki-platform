/**
 * Centralised prompt registry.
 * All LLM prompts live here so they can be versioned, tested, and extended
 * with few-shot examples without touching service logic.
 */

// ── RAG chat ──────────────────────────────────────────────

export function ragSystemPrompt(context) {
  return `You are an expert IT operations assistant. Answer using ONLY the documentation below.
If the answer isn't fully covered by the docs, say so explicitly and rate your own confidence
as HIGH, MEDIUM, or LOW at the end of your response in the format: **Confidence: <level>**.

DOCUMENTATION:
${context}`;
}

export const ragNoContextPrompt =
  'You are an expert IT operations assistant. No documentation context was found for this question. ' +
  'Advise the user to check that documents have been imported and indexed.';

// ── Document restructuring (with few-shot examples) ───────

export function restructurePrompt(title, content) {
  return `Convert this IT operations page into clean, well-structured Markdown with YAML frontmatter.
Structure it with: Overview, Architecture/Components, Procedures, Monitoring, Troubleshooting (where applicable).
Flag outdated info with blockquote warnings. Be concise and scannable.

--- EXAMPLE INPUT ---
TITLE: DNS Server Overview

CONTENT:
Our dns servers run bind9 on 10.0.0.1 and 10.0.0.2. The primary is 10.0.0.1.
To restart use: sudo systemctl restart named. Last updated 2019.

--- EXAMPLE OUTPUT ---
---
title: DNS Server Overview
tags: [dns, bind9, networking]
last_reviewed: null
---

## Overview
Two BIND9 DNS servers handle internal name resolution.

| Role | Host |
|------|------|
| Primary | 10.0.0.1 |
| Secondary | 10.0.0.2 |

## Procedures

### Restart DNS service
\`\`\`bash
sudo systemctl restart named
\`\`\`

> **⚠ Potentially outdated:** Content was last updated in 2019. Verify server IPs and config paths are still current.

---END EXAMPLE---

Now convert the following:

TITLE: ${title}

CONTENT:
${content}

Return ONLY valid Markdown. No explanation.`;
}

// ── Change request — propose doc update ───────────────────

export function proposeUpdatePrompt(currentContent, changeDescription, systems) {
  return `Update this documentation to reflect the following change.
CHANGE: ${changeDescription}
SYSTEMS: ${systems.join(', ')}

CURRENT DOCS:
${currentContent}

Return JSON: { "updatedContent": "...", "changeSummary": "...", "sectionsChanged": [], "confidence": 0.0-1.0 }`;
}

// ── Freshness analysis ────────────────────────────────────

export function freshnessPrompt(title, content) {
  return `Analyse this IT documentation for quality and freshness issues.
DOC: ${title}

${content.substring(0, 6000)}

Return JSON: { "freshnessScore": 0-100, "issues": [{ "type": "...", "description": "...", "severity": "low|medium|high" }], "recommendations": [] }`;
}

// ── Document classification ───────────────────────────────

export function classifyDocumentPrompt(title, contentMd, categoryList) {
  return `Classify this IT operations document.

TITLE: ${title}

CONTENT (first 2000 chars):
${contentMd.substring(0, 2000)}

AVAILABLE CATEGORIES:
${categoryList}

Return ONLY valid JSON in this exact format:
{
  "suggestedCategorySlug": "<slug from the list above, or null if none fits>",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "intent": "reference|howto|troubleshoot|policy|architecture",
  "confidence": 0.85
}

Rules:
- suggestedCategorySlug must be one of the slugs listed above or null
- suggestedTags: 3-7 lowercase hyphenated technical keywords
- confidence: 0.0-1.0 reflecting certainty about the category`;
}

// ── Intent classification ─────────────────────────────────

export function classifyIntentPrompt(question) {
  return `Classify this IT operations question into one category.

Question: "${question.substring(0, 200)}"

Reply with exactly one word from: troubleshoot, howto, reference, explain, other`;
}
