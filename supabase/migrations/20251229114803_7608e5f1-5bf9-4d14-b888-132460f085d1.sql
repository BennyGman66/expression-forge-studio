-- Add look_id column to generation_jobs table for organizing results by look
ALTER TABLE generation_jobs 
ADD COLUMN look_id uuid REFERENCES talent_looks(id);

-- Add talent_image_id column to track which talent image was used
ALTER TABLE generation_jobs 
ADD COLUMN talent_image_id uuid REFERENCES talent_images(id);

-- Add look_id and talent_image_id to generations table for easier querying
ALTER TABLE generations
ADD COLUMN look_id uuid REFERENCES talent_looks(id);

ALTER TABLE generations  
ADD COLUMN talent_image_id uuid REFERENCES talent_images(id);

ALTER TABLE generations
ADD COLUMN view text;

ALTER TABLE generations
ADD COLUMN slot text;