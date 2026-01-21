-- Add retry tracking columns to repose_outputs
ALTER TABLE repose_outputs 
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS retry_after timestamptz;

-- Add index for efficient querying of ready-to-process items
CREATE INDEX IF NOT EXISTS idx_repose_outputs_retry_after 
ON repose_outputs (batch_id, status, retry_after) 
WHERE status = 'queued';