-- Add column to track requested resolution for 4K vs 1K outputs
ALTER TABLE public.repose_outputs 
ADD COLUMN IF NOT EXISTS requested_resolution TEXT DEFAULT '1K';

-- Create index for efficient 4K queries
CREATE INDEX IF NOT EXISTS idx_repose_outputs_resolution 
ON public.repose_outputs (batch_id, requested_resolution) 
WHERE requested_resolution = '4K';