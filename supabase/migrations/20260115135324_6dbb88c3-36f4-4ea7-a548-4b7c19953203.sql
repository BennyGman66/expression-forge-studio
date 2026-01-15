-- Add look_code to talent_looks for matching across imports
ALTER TABLE talent_looks 
ADD COLUMN IF NOT EXISTS look_code TEXT;

-- Add original_filename to look_source_images for traceability
ALTER TABLE look_source_images 
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Create index for efficient deduplication queries
CREATE INDEX IF NOT EXISTS idx_talent_looks_project_look_code 
ON talent_looks(project_id, look_code);

-- Create index for querying images by look and view (for dedup checks)
CREATE INDEX IF NOT EXISTS idx_look_source_images_look_view 
ON look_source_images(look_id, view);