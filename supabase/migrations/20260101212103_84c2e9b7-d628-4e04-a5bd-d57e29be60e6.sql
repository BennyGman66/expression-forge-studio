-- Make legacy columns nullable in face_pairings
ALTER TABLE face_pairings ALTER COLUMN talent_id DROP NOT NULL;
ALTER TABLE face_pairings ALTER COLUMN talent_image_id DROP NOT NULL;

-- Add model column to face_pairing_jobs
ALTER TABLE face_pairing_jobs ADD COLUMN model text DEFAULT 'google/gemini-2.5-flash-image-preview';