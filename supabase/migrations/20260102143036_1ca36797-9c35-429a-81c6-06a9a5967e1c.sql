-- Add is_face_foundation column to face_pairing_outputs table
ALTER TABLE face_pairing_outputs 
ADD COLUMN is_face_foundation BOOLEAN DEFAULT false;

-- Add index for faster querying of face foundations
CREATE INDEX idx_face_pairing_outputs_is_face_foundation 
ON face_pairing_outputs(is_face_foundation) 
WHERE is_face_foundation = true;