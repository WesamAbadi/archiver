-- Create GIN indexes for full-text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create similarity function if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'similarity') THEN
    CREATE FUNCTION similarity(text, text) RETURNS float
    AS 'SELECT similarity($1, $2);'
    LANGUAGE SQL
    IMMUTABLE
    RETURNS NULL ON NULL INPUT;
  END IF;
END $$;

-- Create a function to generate the search vector
CREATE OR REPLACE FUNCTION media_item_search_vector(
  title TEXT,
  description TEXT,
  "originalTitle" TEXT,
  "originalDescription" TEXT,
  "aiSummary" TEXT,
  tags TEXT[],
  hashtags TEXT[],
  "aiKeywords" TEXT[]
) RETURNS tsvector AS $$
BEGIN
  RETURN (
    setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE("originalTitle", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE("originalDescription", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE("aiSummary", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(hashtags, ' '), '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string("aiKeywords", ' '), '')), 'C')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add search vector column to media_items
ALTER TABLE "media_items" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    media_item_search_vector(
      title,
      description,
      "originalTitle",
      "originalDescription",
      "aiSummary",
      tags,
      hashtags,
      "aiKeywords"
    )
  ) STORED;

-- Create GIN index on the search vector
DROP INDEX IF EXISTS "media_items_searchVector_idx";
CREATE INDEX "media_items_searchVector_idx" ON "media_items" USING GIN ("searchVector");

-- Create trigram indexes for fuzzy matching
DROP INDEX IF EXISTS media_items_title_trgm_idx;
CREATE INDEX media_items_title_trgm_idx ON "media_items" USING GIN (title gin_trgm_ops);

DROP INDEX IF EXISTS media_items_description_trgm_idx;
CREATE INDEX media_items_description_trgm_idx ON "media_items" USING GIN (description gin_trgm_ops);

-- Create index for caption segments text
DROP INDEX IF EXISTS caption_segments_text_trgm_idx;
CREATE INDEX caption_segments_text_trgm_idx ON "caption_segments" USING GIN (text gin_trgm_ops);

-- Create function for caption search ranking
CREATE OR REPLACE FUNCTION rank_caption_matches(
  media_item_id TEXT,
  search_query TEXT
) RETURNS FLOAT AS $$
DECLARE
  rank FLOAT;
BEGIN
  SELECT COALESCE(MAX(similarity(cs.text, search_query)), 0)
  INTO rank
  FROM caption_segments cs
  JOIN captions c ON c.id = cs."captionId"
  WHERE c."mediaItemId" = media_item_id;
  
  RETURN rank;
END;
$$ LANGUAGE plpgsql;
