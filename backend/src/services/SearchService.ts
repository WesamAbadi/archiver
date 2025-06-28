import prisma from '../lib/database';
import { Prisma, Visibility } from '@prisma/client';
import { MediaItem } from '../types';

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

  async search({ query, limit = SearchService.DEFAULT_LIMIT, offset = 0, userId, includePrivate = false }: SearchOptions): Promise<SearchResult> {
    if (!query.trim()) {
      return { items: [], total: 0, hasMore: false };
    }

    // Normalize search query
    const searchQuery = query.trim();
    // Add wildcard to each word for partial matching
    const tsQuery = searchQuery
      .split(/\s+/)
      .map(word => `${word}:*`)
      .join(' & ');

    // Build base query conditions
    const visibilityCondition = includePrivate && userId
      ? { OR: [
          { visibility: Visibility.PUBLIC },
          { userId, visibility: Visibility.PRIVATE }
        ]}
      : { visibility: Visibility.PUBLIC };

    // Execute search query with ranking
    const [items, total] = await Promise.all([
      prisma.$queryRaw<MediaItem[]>`
        WITH caption_matches AS (
          SELECT DISTINCT 
            c."mediaItemId",
            MAX(similarity(cs.text, ${searchQuery})) as caption_sim,
            string_agg(cs.text, ' ') as matching_text
          FROM caption_segments cs
          JOIN captions c ON c.id = cs."captionId"
          WHERE 
            cs.text % ${searchQuery}
            OR cs.text ILIKE ${`%${searchQuery}%`}
          GROUP BY c."mediaItemId"
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
            COALESCE(ts_rank_cd(m."searchVector", to_tsquery('english', ${tsQuery})), 0) * 3 +
            COALESCE(similarity(m.title, ${searchQuery}), 0) * 2 +
            COALESCE(similarity(COALESCE(m.description, ''), ${searchQuery}), 0) +
            COALESCE(cm.caption_sim, 0) * 1.5 as rank,
            cm.matching_text as caption_match
          FROM "media_items" m
          LEFT JOIN caption_matches cm ON cm."mediaItemId" = m.id
          WHERE 
            (m.visibility = 'PUBLIC' OR (m.visibility = 'PRIVATE' AND m."userId" = ${userId || ''}))
            AND (
              m."searchVector" @@ to_tsquery('english', ${tsQuery})
              OR m.title ILIKE ${`%${searchQuery}%`}
              OR m.description ILIKE ${`%${searchQuery}%`}
              OR m.title % ${searchQuery}
              OR m.description % ${searchQuery}
              OR EXISTS (
                SELECT 1 
                FROM caption_segments cs
                JOIN captions c ON c.id = cs."captionId"
                WHERE c."mediaItemId" = m.id
                AND (
                  cs.text % ${searchQuery}
                  OR cs.text ILIKE ${`%${searchQuery}%`}
                )
              )
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
        ORDER BY rank DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      prisma.mediaItem.count({
        where: {
          AND: [
            visibilityCondition,
            {
              OR: [
                { title: { contains: searchQuery, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: searchQuery, mode: Prisma.QueryMode.insensitive } },
                {
                  captions: {
                    some: {
                      segments: {
                        some: {
                          text: { contains: searchQuery, mode: Prisma.QueryMode.insensitive }
                        }
                      }
                    }
                  }
                }
              ]
            }
          ]
        }
      })
    ]);

    return {
      items,
      total,
      hasMore: offset + items.length < total
    };
  }

  async getSearchSuggestions(query: string, limit: number = 5): Promise<string[]> {
    if (!query.trim()) {
      return [];
    }

    const searchQuery = query.trim();

    // Get suggestions from titles, tags, and captions
    const suggestions = await prisma.$queryRaw<Array<{ term: string }>>`
      WITH terms AS (
        -- Get matching titles
        SELECT title as term, 1 as priority, similarity(title, ${searchQuery}) as sim
        FROM "media_items"
        WHERE title % ${searchQuery}
        OR title ILIKE ${`%${searchQuery}%`}
        AND visibility = 'PUBLIC'
        
        UNION ALL
        
        -- Get matching tags
        SELECT unnest(tags) as term, 2 as priority, similarity(unnest(tags), ${searchQuery}) as sim
        FROM "media_items"
        WHERE visibility = 'PUBLIC'
        AND (
          array_to_string(tags, ' ') % ${searchQuery}
          OR array_to_string(tags, ' ') ILIKE ${`%${searchQuery}%`}
        )
        
        UNION ALL
        
        -- Get matching caption segments
        SELECT DISTINCT cs.text as term, 3 as priority, similarity(cs.text, ${searchQuery}) as sim
        FROM caption_segments cs
        JOIN captions c ON c.id = cs."captionId"
        JOIN "media_items" m ON m.id = c."mediaItemId"
        WHERE (
          cs.text % ${searchQuery}
          OR cs.text ILIKE ${`%${searchQuery}%`}
        )
        AND m.visibility = 'PUBLIC'
      )
      SELECT term, priority, sim
      FROM terms
      GROUP BY term, priority, sim
      ORDER BY sim DESC, priority ASC
      LIMIT ${limit}
    `;

    return suggestions.map(s => s.term);
  }
} 