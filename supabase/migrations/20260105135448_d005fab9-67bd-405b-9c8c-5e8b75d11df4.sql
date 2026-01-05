-- Add columns to track asset revisions
ALTER TABLE submission_assets ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES submission_assets(id);
ALTER TABLE submission_assets ADD COLUMN IF NOT EXISTS revision_number INTEGER DEFAULT 1;

-- Create index for efficient querying of current assets
CREATE INDEX IF NOT EXISTS idx_submission_assets_superseded_by ON submission_assets(superseded_by) WHERE superseded_by IS NULL;

-- Clean up existing V1 submission that's now superseded by V2
-- First, delete the V1 assets
DELETE FROM submission_assets WHERE submission_id = '069ea884-3e10-4b98-8f39-fb0547803e73';

-- Then delete the V1 submission
DELETE FROM job_submissions WHERE id = '069ea884-3e10-4b98-8f39-fb0547803e73';

-- Update V2 to be version 1 (since it's now the only version)
UPDATE job_submissions SET version_number = 1 WHERE id = '63cb0c91-3a59-4e38-b6f9-2e13e9b9e78b';