-- Add error_message column to repose_outputs for storing cancellation/failure messages
ALTER TABLE repose_outputs 
ADD COLUMN IF NOT EXISTS error_message TEXT;