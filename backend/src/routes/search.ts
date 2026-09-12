/**
 * Search routes.
 *
 * GET /search              full search over titles, tags, descriptions, lyrics
 * GET /search/suggestions  typeahead (titles + tags)
 *
 * Both are public — searching is how the archive is explored, and it is the same
 * query for everyone. The owner scoping inside the service is now a parameter
 * rather than a session: an admin read stays owner-scoped, a visitor's does not.
 *
 * (The old app's version of these endpoints took `includePrivate` as a *client*
 * parameter and never checked ownership, so transcripts were readable by anyone
 * who guessed the shape. Here the audience is decided server-side.)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { getAdmin, optionalAuth } from '../auth';
import { MAX_QUERY_LENGTH, searchMedia, suggest } from '../services/search';
import { toPublicMediaItem } from '../services/media';

export const searchRoutes = new Hono<AppEnv>();

export const searchQuerySchema = z.object({
  // `q` is optional so a bare /search renders an empty state instead of a 400.
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

searchRoutes.get('/', optionalAuth, async (c) => {
  const parsed = searchQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid search parameters' }, 400);
  }

  const admin = getAdmin(c);
  const { q, page, limit } = parsed.data;

  const result = await searchMedia(c.get('db'), admin?.id, { query: q, page, limit });

  return c.json({
    success: true,
    data: admin
      ? result
      : // Results are full media items, so they carry the same provider error
        // text the library list does — narrowed here for the same reason.
        { ...result, items: result.items.map((hit) => ({ ...hit, ...toPublicMediaItem(hit) })) },
  });
});

const suggestQuerySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional().default(''),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

searchRoutes.get('/suggestions', optionalAuth, async (c) => {
  const parsed = suggestQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid suggestion parameters' }, 400);
  }

  const admin = getAdmin(c);
  const suggestions = await suggest(c.get('db'), admin?.id, parsed.data.q, parsed.data.limit);
  return c.json({ success: true, data: { suggestions } });
});
