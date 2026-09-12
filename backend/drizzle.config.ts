import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Points at the REAL Postgres database (not Hyperdrive) for migration generation.
// The Worker itself connects through the HYPERDRIVE binding at runtime.
export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
