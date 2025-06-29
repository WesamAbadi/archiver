import prisma from '../lib/database';
import { Prisma, Visibility } from '@prisma/client';
import { MediaItem } from '../types';
import { ArabicTextProcessor } from '../utils/arabicTextUtils';

interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  userId?: string;
  includePrivate?: boolean;
}

interface SearchResult {
  items: MediaItem[];
  total: number;
  hasMore: boolean;
}

export class SearchService {
  static readonly DEFAULT_LIMIT = 20;
  private static readonly FUZZY_THRESHOLD = 0.3;

  async search({ query, limit = SearchService.DEFAULT_LIMIT, offset = 0, userId, includePrivate = false }: SearchOptions): Promise<SearchResult> {
    if (!query.trim()) {
      return { items: [], total: 0, hasMore: false };
    }

    // Use ArabicTextProcessor for query preprocessing
    const {
      original: originalQuery,
      normalized: normalizedQuery,
      variants: queryVariants,
      sqlPatterns
    } = ArabicTextProcessor.preprocessSearchQuery(query);
    
    // Build tsquery for full-text search
    const tsQuery = originalQuery
      .split(/\s+/)
      .map(word => `${ArabicTextProcessor.normalizeArabic(word)}:*`)
      .join(' & ');

    // Build base query conditions
    const visibilityCondition = includePrivate && userId
      ? { OR: [
          { visibility: Visibility.PUBLIC },
          { userId, visibility: Visibility.PRIVATE }
        ]}
      : { visibility: Visibility.PUBLIC };

    const variantPatterns = queryVariants.join('|');

    // Execute enhanced search query with fuzzy matching
    const [items, total] = await Promise.all([
      prisma.$queryRaw<MediaItem[]>`
        WITH RECURSIVE fuzzy_matches AS (
          -- Exact and normalized matches
          SELECT DISTINCT 
            c."mediaItemId",
            1.0 as base_score,
            string_agg(DISTINCT cs.text, ' ') as matching_text,
            'exact' as match_type
          FROM caption_segments cs
          JOIN captions c ON c.id = cs."captionId"
          WHERE 
            cs.text ILIKE ${`%${originalQuery}%`}
            OR cs.text ILIKE ${`%${normalizedQuery}%`}
          GROUP BY c."mediaItemId"
          
          UNION ALL
          
          -- Variant matches  
          SELECT DISTINCT 
            c."mediaItemId",
            0.9 as base_score,
            string_agg(DISTINCT cs.text, ' ') as matching_text,
            'variant' as match_type
          FROM caption_segments cs
          JOIN captions c ON c.id = cs."captionId"
          WHERE EXISTS (
            SELECT 1 FROM unnest(string_to_array(${variantPatterns}, '|')) AS variant
            WHERE cs.text ILIKE '%' || variant || '%'
          )
          GROUP BY c."mediaItemId"
          
          UNION ALL
          
          -- Fuzzy similarity matches
          SELECT DISTINCT 
            c."mediaItemId",
            GREATEST(
              similarity(cs.text, ${originalQuery}),
              similarity(cs.text, ${normalizedQuery}),
              word_similarity(cs.text, ${originalQuery}),
              word_similarity(cs.text, ${normalizedQuery})
            ) as base_score,
            string_agg(DISTINCT cs.text, ' ') as matching_text,
            'fuzzy' as match_type
          FROM caption_segments cs
          JOIN captions c ON c.id = cs."captionId"
          WHERE 
            (cs.text % ${originalQuery} OR cs.text % ${normalizedQuery})
            AND (
              similarity(cs.text, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR similarity(cs.text, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(cs.text, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(cs.text, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
            )
          GROUP BY c."mediaItemId", cs.text
        ),
        aggregated_matches AS (
          SELECT 
            "mediaItemId",
            MAX(base_score) as caption_sim,
            string_agg(matching_text, ' ') as all_matching_text
          FROM fuzzy_matches
          GROUP BY "mediaItemId"
        ),
        ranked_items AS (
          SELECT 
            m.id,
            m."userId",
            m."originalUrl",
            m.platform,
            m.title,
            m.description,
            m.visibility,
            m.tags,
            m."createdAt",
            m."updatedAt",
            m."downloadStatus",
            m."publicId",
            m.duration,
            m.size::text::numeric as size,
            m.format,
            m.resolution,
            m."thumbnailUrl",
            m."originalAuthor",
            m."originalTitle",
            m."originalDescription",
            m."publishedAt",
            m.hashtags,
            m."aiSummary",
            m."aiKeywords",
            m."aiGeneratedAt",
            m."viewCount",
            m."likeCount",
            m."commentCount",
            GREATEST(
              -- Full-text search score
              COALESCE(ts_rank_cd(m."searchVector", to_tsquery('simple', ${tsQuery})), 0) * 3,
              
              -- Title fuzzy matching
              COALESCE(similarity(m.title, ${originalQuery}), 0) * 2.5,
              COALESCE(similarity(m.title, ${normalizedQuery}), 0) * 2.5,
              COALESCE(word_similarity(m.title, ${originalQuery}), 0) * 2.0,
              COALESCE(word_similarity(m.title, ${normalizedQuery}), 0) * 2.0,
              
              -- Description fuzzy matching
              COALESCE(similarity(COALESCE(m.description, ''), ${originalQuery}), 0) * 1.5,
              COALESCE(similarity(COALESCE(m.description, ''), ${normalizedQuery}), 0) * 1.5,
              COALESCE(word_similarity(COALESCE(m.description, ''), ${originalQuery}), 0) * 1.0,
              COALESCE(word_similarity(COALESCE(m.description, ''), ${normalizedQuery}), 0) * 1.0,
              
              -- Caption fuzzy matching
              COALESCE(am.caption_sim, 0) * 2.0
            ) as rank,
            am.all_matching_text as caption_match
          FROM "media_items" m
          LEFT JOIN aggregated_matches am ON am."mediaItemId" = m.id
          WHERE 
            (m.visibility = 'PUBLIC' OR (m.visibility = 'PRIVATE' AND m."userId" = ${userId || ''}))
            AND (
              -- Full-text search
              m."searchVector" @@ to_tsquery('simple', ${tsQuery})
              
              -- Exact matches
              OR m.title ILIKE ${`%${originalQuery}%`}
              OR m.description ILIKE ${`%${originalQuery}%`}
              
              -- Normalized matches
              OR m.title ILIKE ${`%${normalizedQuery}%`}
              OR m.description ILIKE ${`%${normalizedQuery}%`}
              
              -- Fuzzy matches
              OR m.title % ${originalQuery}
              OR m.title % ${normalizedQuery}
              OR m.description % ${originalQuery}
              OR m.description % ${normalizedQuery}
              
              -- Similarity threshold matches (for title)
              OR similarity(m.title, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR similarity(m.title, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(m.title, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(m.title, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}

              -- Similarity threshold matches (for description)
              OR similarity(COALESCE(m.description, ''), ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR similarity(COALESCE(m.description, ''), ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(COALESCE(m.description, ''), ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(COALESCE(m.description, ''), ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
              
              -- Caption matches
              OR am."mediaItemId" IS NOT NULL
            )
        ),
        media_with_files AS (
          SELECT 
            i.*,
            u."displayName" as "userDisplayName",
            u."photoURL" as "userPhotoURL",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', f.id,
                  'filename', f.filename,
                  'originalName', f."originalName",
                  'mimeType', f."mimeType",
                  'size', f.size::text::numeric,
                  'downloadUrl', f."downloadUrl",
                  'isOriginal', f."isOriginal",
                  'format', f.format
                )
              ) FILTER (WHERE f.id IS NOT NULL),
              '[]'
            ) as files
          FROM ranked_items i
          LEFT JOIN users u ON u.id = i."userId"
          LEFT JOIN "media_files" f ON f."mediaItemId" = i.id
          GROUP BY 
            i.id, i."userId", i."originalUrl", i.platform, i.title, i.description,
            i.visibility, i.tags, i."createdAt", i."updatedAt", i."downloadStatus",
            i."publicId", i.duration, i.size, i.format, i.resolution, i."thumbnailUrl",
            i."originalAuthor", i."originalTitle", i."originalDescription", i."publishedAt",
            i.hashtags, i."aiSummary", i."aiKeywords", i."aiGeneratedAt", i."viewCount",
            i."likeCount", i."commentCount", i.rank, i.caption_match,
            u."displayName", u."photoURL"
        )
        SELECT 
          mf.*,
          mf.files::jsonb as files
        FROM media_with_files mf
        WHERE mf.rank > 0.1  -- Filter out very low relevance matches
        ORDER BY mf.rank DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      // Enhanced count query with fuzzy matching
      this.getFuzzySearchCount(originalQuery, normalizedQuery, queryVariants, visibilityCondition, userId)
    ]);

    return {
      items,
      total,
      hasMore: offset + items.length < total
    };
  }

  private async getFuzzySearchCount(
    originalQuery: string, 
    normalizedQuery: string, 
    queryVariants: string[], 
    visibilityCondition: any,
    userId?: string
  ): Promise<number> {
    const variantPatterns = queryVariants.join('|');
    
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT m.id)::bigint as count
      FROM "media_items" m
      LEFT JOIN captions c ON c."mediaItemId" = m.id
      LEFT JOIN caption_segments cs ON cs."captionId" = c.id
      WHERE 
        (m.visibility = 'PUBLIC' OR (m.visibility = 'PRIVATE' AND m."userId" = ${userId || ''}))
        AND (
          -- Title matches
          m.title ILIKE ${`%${originalQuery}%`}
          OR m.title ILIKE ${`%${normalizedQuery}%`}
          OR m.title % ${originalQuery}
          OR m.title % ${normalizedQuery}
          OR similarity(m.title, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR similarity(m.title, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR word_similarity(m.title, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR word_similarity(m.title, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
          
          -- Description matches  
          OR m.description ILIKE ${`%${originalQuery}%`}
          OR m.description ILIKE ${`%${normalizedQuery}%`}
          OR m.description % ${originalQuery}
          OR m.description % ${normalizedQuery}
          OR similarity(m.description, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR similarity(m.description, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR word_similarity(m.description, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
          OR word_similarity(m.description, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
          
          -- Caption matches
          OR EXISTS (
            SELECT 1 FROM caption_segments cs2
            JOIN captions c2 ON c2.id = cs2."captionId"
            WHERE c2."mediaItemId" = m.id
            AND (
              cs2.text ILIKE ${`%${originalQuery}%`}
              OR cs2.text ILIKE ${`%${normalizedQuery}%`}
              OR cs2.text % ${originalQuery}
              OR cs2.text % ${normalizedQuery}
              OR similarity(cs2.text, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR similarity(cs2.text, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(cs2.text, ${originalQuery}) > ${SearchService.FUZZY_THRESHOLD}
              OR word_similarity(cs2.text, ${normalizedQuery}) > ${SearchService.FUZZY_THRESHOLD}
            )
          )
        )
    `;
    
    return Number(result[0]?.count || 0);
  }

  async getSearchSuggestions(query: string, limit: number = 5): Promise<string[]> {
    if (!query.trim()) {
      return [];
    }

    const {
      original: originalQuery,
      normalized: normalizedQuery,
      variants: queryVariants
    } = ArabicTextProcessor.preprocessSearchQuery(query);

    // Get suggestions with fuzzy matching
    const suggestions = await prisma.$queryRaw<Array<{ term: string; score: number }>>`
      WITH fuzzy_suggestions AS (
        -- Title suggestions with fuzzy matching
        SELECT DISTINCT 
          title as term,
          1 as priority,
          GREATEST(
            similarity(title, ${originalQuery}),
            similarity(title, ${normalizedQuery}),
            word_similarity(title, ${originalQuery}),
            word_similarity(title, ${normalizedQuery})
          ) as score
        FROM "media_items"
        WHERE visibility = 'PUBLIC'
        AND (
          title ILIKE ${`%${originalQuery}%`}
          OR title ILIKE ${`%${normalizedQuery}%`}
          OR title % ${originalQuery}
          OR title % ${normalizedQuery}
          OR similarity(title, ${originalQuery}) > 0.2
          OR similarity(title, ${normalizedQuery}) > 0.2
        )
        
        UNION ALL
        
        -- Tag suggestions
        SELECT DISTINCT 
          unnest(tags) as term,
          2 as priority,
          GREATEST(
            similarity(unnest(tags), ${originalQuery}),
            similarity(unnest(tags), ${normalizedQuery})
          ) as score
        FROM "media_items"
        WHERE visibility = 'PUBLIC'
        AND (
          array_to_string(tags, ' ') ILIKE ${`%${originalQuery}%`}
          OR array_to_string(tags, ' ') ILIKE ${`%${normalizedQuery}%`}
          OR array_to_string(tags, ' ') % ${originalQuery}
          OR array_to_string(tags, ' ') % ${normalizedQuery}
        )
        
        UNION ALL
        
        -- Caption suggestions
        SELECT DISTINCT 
          cs.text as term,
          3 as priority,
          GREATEST(
            similarity(cs.text, ${originalQuery}),
            similarity(cs.text, ${normalizedQuery}),
            word_similarity(cs.text, ${originalQuery}),
            word_similarity(cs.text, ${normalizedQuery})
          ) as score
        FROM caption_segments cs
        JOIN captions c ON c.id = cs."captionId"
        JOIN "media_items" m ON m.id = c."mediaItemId"
        WHERE m.visibility = 'PUBLIC'
        AND (
          cs.text ILIKE ${`%${originalQuery}%`}
          OR cs.text ILIKE ${`%${normalizedQuery}%`}
          OR cs.text % ${originalQuery}
          OR cs.text % ${normalizedQuery}
          OR similarity(cs.text, ${originalQuery}) > 0.2
          OR similarity(cs.text, ${normalizedQuery}) > 0.2
        )
      )
      SELECT term, MAX(score) as score
      FROM fuzzy_suggestions
      WHERE score > 0.1
      GROUP BY term
      ORDER BY score DESC, length(term) ASC
      LIMIT ${limit * 2}
    `;

    // Further filter and rank suggestions using our custom fuzzy matcher
    const rankedSuggestions = suggestions
      .map(s => ({
        term: s.term,
        score: Math.max(
          s.score,
          ArabicTextProcessor.calculateSimilarity(originalQuery, s.term)
        )
      }))
      .filter(s => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.term);

    return rankedSuggestions;
  }
} 