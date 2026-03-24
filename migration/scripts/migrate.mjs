#!/usr/bin/env node
/**
 * OperWiki Migration CLI
 * ──────────────────────
 * Usage:
 *   node migrate.js --mode xml --file ./export.xml [--category <slug>] [--dry-run] [--no-ai]
 *   node migrate.js --mode api --url http://your-wiki.local/w [--limit 200]
 *   node migrate.js --mode single --file ./page.md --title "Page Title"
 */
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    mode:     { type: 'string', default: 'xml' },
    file:     { type: 'string' },
    url:      { type: 'string' },
    title:    { type: 'string' },
    category: { type: 'string' },
    limit:    { type: 'string', default: '500' },
    'dry-run':{ type: 'boolean', default: false },
    'no-ai':  { type: 'boolean', default: false },
    'api-url':{ type: 'string', default: 'http://localhost:4000' },
    token:    { type: 'string' },
  }
});

const API_URL = args['api-url'];
const TOKEN   = args.token || process.env.OPERWIKI_TOKEN;

async function main() {
  console.log(`\n🚀 OperWiki Migration Tool`);
  console.log(`   Mode: ${args.mode}`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Dry-run: ${args['dry-run']}`);
  console.log(`   AI restructure: ${!args['no-ai']}\n`);

  const headers = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };

  let endpoint, body;

  if (args.mode === 'xml') {
    if (!args.file) { console.error('--file required for xml mode'); process.exit(1); }
    const xmlContent = readFileSync(args.file, 'utf-8');
    endpoint = `${API_URL}/api/migration/xml`;
    body = {
      xmlContent,
      categorySlug: args.category,
      dryRun: args['dry-run'],
      useAI: !args['no-ai'],
    };
  } else if (args.mode === 'api') {
    if (!args.url) { console.error('--url required for api mode'); process.exit(1); }
    endpoint = `${API_URL}/api/migration/from-api`;
    body = {
      mwBaseUrl: args.url,
      limit: parseInt(args.limit),
      categorySlug: args.category,
      dryRun: args['dry-run'],
      useAI: !args['no-ai'],
    };
  } else if (args.mode === 'single') {
    if (!args.file || !args.title) { console.error('--file and --title required for single mode'); process.exit(1); }
    const content = readFileSync(args.file, 'utf-8');
    endpoint = `${API_URL}/api/migration/single`;
    body = { title: args.title, content, categorySlug: args.category, useAI: !args['no-ai'] };
  } else {
    console.error(`Unknown mode: ${args.mode}`);
    process.exit(1);
  }

  try {
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.text();
      console.error(`API error ${res.status}: ${err}`);
      process.exit(1);
    }
    const result = await res.json();

    console.log(`\n✅ Migration complete!`);
    console.log(`   Total pages: ${result.total}`);
    console.log(`   ✓ Success:   ${result.success}`);
    console.log(`   ⏭  Skipped:  ${result.skipped || 0}`);
    console.log(`   ✗ Failed:    ${result.failed || 0}`);

    if (args['dry-run'] && result.items) {
      console.log(`\n📋 Preview (first 3):`);
      result.items.slice(0, 3).forEach(item => {
        console.log(`\n  📄 ${item.title}`);
        if (item.contentPreview) console.log(`     ${item.contentPreview.substring(0, 200)}...`);
      });
    }

    if (result.failed > 0) {
      console.log(`\n⚠️  Failed pages:`);
      result.items.filter(i => i.status === 'failed').forEach(i =>
        console.log(`   - ${i.title}: ${i.error}`)
      );
    }
  } catch (err) {
    console.error(`\n❌ Migration failed: ${err.message}`);
    process.exit(1);
  }
}

main();
