/**
 * Database client for Cloudflare Workers.
 *
 * - Production: connect via the Hyperdrive binding (connection pooling at the edge).
 * - Local dev (no Hyperdrive binding bound): fall back to a direct connection
 *   string from env so `wrangler dev` works without infra setup.
 *
 * A client is created per request (required pattern for Hyperdrive — see
 * https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/).
 */
import { Client } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export interface DBEnv {
  /** Hyperdrive binding (production). Optional so local dev works without it. */
  HYPERDRIVE?: {
    connectionString: string;
  };
  /** Fallback direct connection string for local dev (`wrangler dev --var`). */
  DATABASE_URL?: string;
}

export type DB = NodePgDatabase<typeof schema>;

export function createDB(env: DBEnv): DB {
  let connectionString: string | undefined = env.HYPERDRIVE?.connectionString;

  if (!connectionString) {
    connectionString = env.DATABASE_URL;
  }

  if (!connectionString) {
    throw new Error(
      'Database not configured: bind HYPERDRIVE in production or set DATABASE_URL for local dev',
    );
  }

  const client = new Client({ connectionString });
  return drizzle(client, { schema });
}
