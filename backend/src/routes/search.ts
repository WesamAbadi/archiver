import { Router, Request } from 'express';
import { SearchService } from '../services/SearchService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { z } from 'zod';

const router: Router = Router();
const searchService = new SearchService();

// Validation schemas
const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  includePrivate: z.boolean().optional()
});

const suggestionsQuerySchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(10).optional()
});

// Search endpoint
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { query, limit, offset, includePrivate } = searchQuerySchema.parse({
      query: req.query.q,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      includePrivate: req.query.includePrivate === 'true'
    });

    const results = await searchService.search({
      query,
      limit,
      offset,
      userId: req.user.uid,
      includePrivate
    });

    res.json(results);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid search parameters', details: error.errors });
    } else {
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to perform search' });
    }
  }
});

// Search suggestions endpoint
router.get('/suggestions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { query, limit } = suggestionsQuerySchema.parse({
      query: req.query.q,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    });

    const suggestions = await searchService.getSearchSuggestions(query, limit);
    res.json(suggestions);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid suggestion parameters', details: error.errors });
    } else {
      console.error('Suggestions error:', error);
      res.status(500).json({ error: 'Failed to get suggestions' });
    }
  }
});

export default router; 