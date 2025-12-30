ALTER TABLE face_identities 
ADD COLUMN talent_id uuid REFERENCES talents(id) ON DELETE SET NULL;