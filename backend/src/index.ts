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
import { captionRoutes } from './routes/captions';
import { searchRoutes } from './routes/search';
import { handleQueueBatch, handleScheduled } from './queue/consumer';
import type { CaptionJobMessage } from './queue/messages';

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
    // PUT is here because the caption editor saves segments with
    // PUT /api/media/:id/captions/:captionId. Omitting it meant the browser's
    // preflight was rejected and saving a transcript failed with a bare
    // "Could not reach the server" — while every curl-based test passed, since
    // curl does not send a preflight. Any new method used by the frontend must
    // be added here or the request dies in the browser and nowhere else.
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

// Per-request DB client (required for Hyperdrive). Scoped to /api/* so the
// /health check stays DB-free and can't hang when Postgres is unreachable.
app.use('/api/*', async (c, next) => {
  c.set('db', await createDB(c.env));
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
app.route('/api/media', captionRoutes);
app.route('/api/search', searchRoutes);

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
// Workers entry — HTTP + Queues consumer + cron
// ---------------------------------------------------------------------------

export default {
  fetch: app.fetch,
  queue: handleQueueBatch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env, CaptionJobMessage>;
