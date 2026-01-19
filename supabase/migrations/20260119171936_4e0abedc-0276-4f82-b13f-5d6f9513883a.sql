-- Add temp_path column for storing base64 data reference during upload phase
ALTER TABLE repose_outputs 
ADD COLUMN IF NOT EXISTS temp_path TEXT;