-- Make job_id nullable to support project-based batch creation
ALTER TABLE repose_batches 
ALTER COLUMN job_id DROP NOT NULL;