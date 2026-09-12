/**
 * Search routes.
 *
 * GET /search              full search over titles, tags, descriptions, lyrics
 * GET /search/suggestions  typeahead (titles + tags)
 *
 * Both are auth-gated and scoped to the admin's own rows inside the service —
 * the old /search endpoints took `includePrivate` as a *client* parameter and
 * never checked ownership, so transcripts were readable unauthenticated.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAuth } from '../auth';
import { MAX_QUERY_LENGTH, searchMedia, suggest } from '../services/search';

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.use('*', requireAuth);

export const searchQuerySchema = z.object({
  // `q` is optional so a bare /search renders an empty state instead of a 400.
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

searchRoutes.get('/', async (c) => {
  const parsed = searchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid search parameters' }, 400);
  }

  const admin = c.get('admin');
  const { q, page, limit } = parsed.data;

  const result = await searchMedia(c.get('db'), admin.id, { query: q, page, limit });
  return c.json({ success: true, data: result });
});

const suggestQuerySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

searchRoutes.get('/suggestions', async (c) => {
  const parsed = suggestQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid suggestion parameters' }, 400);
  }

  const admin = c.get('admin');
  const suggestions = await suggest(c.get('db'), admin.id, parsed.data.q, parsed.data.limit);
  return c.json({ success: true, data: { suggestions } });
});
