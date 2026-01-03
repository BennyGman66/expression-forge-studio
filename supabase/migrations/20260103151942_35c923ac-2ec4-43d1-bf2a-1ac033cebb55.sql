-- Add new job type
ALTER TYPE job_type ADD VALUE 'FOUNDATION_FACE_REPLACE';

-- Add new artifact types for inputs
ALTER TYPE artifact_type ADD VALUE 'HEAD_RENDER_FRONT';
ALTER TYPE artifact_type ADD VALUE 'HEAD_RENDER_SIDE';
ALTER TYPE artifact_type ADD VALUE 'HEAD_RENDER_BACK';
ALTER TYPE artifact_type ADD VALUE 'LOOK_ORIGINAL';