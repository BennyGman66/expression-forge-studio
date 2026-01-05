-- Add shot_type column to library_poses (keep slot for backward compatibility)
ALTER TABLE library_poses ADD COLUMN IF NOT EXISTS shot_type text;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_library_poses_shot_type ON library_poses(shot_type);

-- Migrate existing slot values to shot_type
UPDATE library_poses SET shot_type = 'FRONT_FULL' WHERE slot = 'A' AND shot_type IS NULL;
UPDATE library_poses SET shot_type = 'FRONT_CROPPED' WHERE slot = 'B' AND shot_type IS NULL;
UPDATE library_poses SET shot_type = 'BACK_FULL' WHERE slot = 'C' AND shot_type IS NULL;
UPDATE library_poses SET shot_type = 'DETAIL' WHERE slot = 'D' AND shot_type IS NULL;

-- Add shot_type column to product_images (keep slot for backward compatibility)
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS shot_type text;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_product_images_shot_type ON product_images(shot_type);

-- Migrate existing slot values to shot_type for product_images
UPDATE product_images SET shot_type = 'FRONT_FULL' WHERE slot = 'A' AND shot_type IS NULL;
UPDATE product_images SET shot_type = 'FRONT_CROPPED' WHERE slot = 'B' AND shot_type IS NULL;
UPDATE product_images SET shot_type = 'BACK_FULL' WHERE slot = 'C' AND shot_type IS NULL;
UPDATE product_images SET shot_type = 'DETAIL' WHERE slot = 'D' AND shot_type IS NULL;

-- Add shot_type column to repose_outputs (keep slot for backward compatibility)
ALTER TABLE repose_outputs ADD COLUMN IF NOT EXISTS shot_type text;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_repose_outputs_shot_type ON repose_outputs(shot_type);

-- Migrate existing slot values to shot_type for repose_outputs
UPDATE repose_outputs SET shot_type = 'FRONT_FULL' WHERE slot = 'A' AND shot_type IS NULL;
UPDATE repose_outputs SET shot_type = 'FRONT_CROPPED' WHERE slot = 'B' AND shot_type IS NULL;
UPDATE repose_outputs SET shot_type = 'BACK_FULL' WHERE slot = 'C' AND shot_type IS NULL;
UPDATE repose_outputs SET shot_type = 'DETAIL' WHERE slot = 'D' AND shot_type IS NULL;