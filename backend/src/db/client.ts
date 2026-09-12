/**
 * Database client for Cloudflare Workers.
 *
 * - Production: connect via the Hyperdrive binding (pooling at the edge).
 * - Local dev (no Hyperdrive binding bound): fall back to a direct connection
 *   string from env so `wrangler dev` works without infra setup.
 *
 * IMPORTANT — `await client.connect()` is not optional here. node-postgres
 * normally connects lazily on the first query, but that implicit path never
 * resolves inside the Workers runtime: the request just hangs until the runtime
 * cancels it ("your Worker's code had hung and would never generate a
 * response"). This matches Cloudflare's own Drizzle + Hyperdrive example.
 *
 * A client is created per request — the supported pattern for Hyperdrive:
 * https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/
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

export async function createDB(env: DBEnv): Promise<DB> {
  const connectionString = env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Database not configured: bind HYPERDRIVE in production or set DATABASE_URL for local dev',
    );
  }

  const client = new Client({ connectionString });
  await client.connect();

  return drizzle(client, { schema });
}
