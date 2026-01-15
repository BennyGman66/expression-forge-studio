-- Add column for original (pre-expansion) source URL
ALTER TABLE look_source_images 
ADD COLUMN original_source_url TEXT;

-- Backfill: For images that haven't been expanded (still have original URL pattern),
-- copy source_url to original_source_url
UPDATE look_source_images 
SET original_source_url = source_url
WHERE source_url LIKE '%/images/face-application/%';