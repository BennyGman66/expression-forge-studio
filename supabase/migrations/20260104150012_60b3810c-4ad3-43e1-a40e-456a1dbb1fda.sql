-- Add per-asset review status tracking
ALTER TABLE submission_assets 
ADD COLUMN review_status TEXT DEFAULT NULL 
CHECK (review_status IN ('APPROVED', 'CHANGES_REQUESTED'));

-- Add reviewer tracking
ALTER TABLE submission_assets 
ADD COLUMN reviewed_by_user_id UUID REFERENCES users(id);

ALTER TABLE submission_assets 
ADD COLUMN reviewed_at TIMESTAMPTZ;