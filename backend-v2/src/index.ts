/**
 * ArchiveDrop API — Cloudflare Workers + Hono.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppEnv, Env } from './env';
import { createDB } from './db/client';
import { authRoutes } from './routes/auth';
import { mediaRoutes } from './routes/media';

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use('*', logger()); // swap for structured logging in Phase 6

// CORS — explicit allowlist from env (the old app allowed any *.vercel.app)
app.use('*', (c, next) => {
  const origins = (c.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return cors({
    origin: origins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

// Per-request DB client (required for Hyperdrive)
app.use('*', (c, next) => {
  c.set('db', createDB(c.env));
  return next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (c) =>
  c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }),
);

app.route('/api/auth', authRoutes);
app.route('/api/media', mediaRoutes);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

app.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err);
  // Never leak internal error details to clients
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

// ---------------------------------------------------------------------------
// Workers entry
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
