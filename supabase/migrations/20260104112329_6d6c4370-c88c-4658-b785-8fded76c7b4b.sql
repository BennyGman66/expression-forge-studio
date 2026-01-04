-- Add columns to persist product URLs and track progress for proper resume
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS product_urls TEXT[];
ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS current_index INTEGER DEFAULT 0;

-- Mark existing stuck jobs as stalled
UPDATE scrape_jobs 
SET status = 'stalled' 
WHERE brand_id = '6187d81a-bff8-425d-a691-8744d1ef35b1' 
  AND status = 'running';