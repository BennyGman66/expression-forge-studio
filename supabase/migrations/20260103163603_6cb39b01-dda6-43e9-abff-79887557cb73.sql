-- Add new artifact types for view-specific original look images
ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'LOOK_ORIGINAL_FRONT';
ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'LOOK_ORIGINAL_SIDE';
ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'LOOK_ORIGINAL_BACK';