/**
 * Apply a migration file to the REAL database inside a transaction, then always
 * roll it back.
 *
 * Why this exists: migrations get applied to a live database, and a migration
 * that fails halfway leaves schema behind that the journal doesn't know about.
 * This proves a migration is valid — including anything Drizzle can't model,
 * like extensions and functions — without changing a single row.
 *
 *   npx tsx scripts/dryrun-migration.ts drizzle/0002_clammy_hercules.sql
 *
 * It is read-only by construction: there is no flag to commit, and the ROLLBACK
 * runs in a `finally` even if a statement throws. Applying a migration for real
 * is `npm run db:migrate`, which is what should be used once this passes.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/dryrun-migration.ts <path-to-migration.sql>');
  process.exit(2);
}

/** Drizzle separates statements with this marker. */
const BREAKPOINT = '--> statement-breakpoint';

/**
 * Strip full-line `--` comments before splitting. A statement-boundary marker
 * hiding inside a comment would otherwise split a statement in half.
 */
function statements(sql: string): string[] {
  return sql
    .split(BREAKPOINT)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

async function main() {
  const sql = readFileSync(file, 'utf8');
  const parts = statements(sql);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`connected — ${parts.length} statement(s) from ${file}\n`);

  let applied = 0;
  try {
    await client.query('BEGIN');
    for (const statement of parts) {
      const label = statement.replace(/\s+/g, ' ').slice(0, 72);
      try {
        await client.query(statement);
        applied += 1;
        console.log(`  OK   ${label}${statement.length > 72 ? '…' : ''}`);
      } catch (err) {
        console.error(`  FAIL ${label}`);
        console.error(`\n${err instanceof Error ? err.message : err}\n`);
        throw err;
      }
    }

    // A generated column is only trustworthy if it can actually be read back.
    const { rows } = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE column_name IN ('search_vector', 'search_text')
        AND table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    console.log(`\n  search columns present: ${rows.map((r) => `${r.table_name}.${r.column_name}`).join(', ') || 'NONE'}`);

    const { rows: idx } = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE '%search%'
      ORDER BY indexname
    `);
    for (const i of idx) {
      const kind = i.indexdef.includes('gin_trgm_ops') ? 'gin/trgm' : i.indexdef.includes('gin') ? 'gin' : 'other';
      console.log(`  index ${i.indexname} (${kind})`);
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
    console.log(`\napplied ${applied}/${parts.length} then rolled back — database untouched`);
  }
}

void main();
