-- Add new column with proper foreign key to digital_talents
ALTER TABLE face_identities 
ADD COLUMN digital_talent_id uuid REFERENCES digital_talents(id);

-- Create index for performance
CREATE INDEX idx_face_identities_digital_talent_id 
ON face_identities(digital_talent_id);