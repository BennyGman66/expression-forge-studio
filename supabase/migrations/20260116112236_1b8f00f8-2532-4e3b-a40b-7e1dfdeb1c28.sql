-- Add selection columns to repose_outputs for favorite/rank tracking
ALTER TABLE public.repose_outputs
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS favorite_rank INTEGER CHECK (favorite_rank IS NULL OR (favorite_rank >= 1 AND favorite_rank <= 3)),
ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ;

-- Create index for efficient favorite queries
CREATE INDEX IF NOT EXISTS idx_repose_outputs_favorite 
ON public.repose_outputs(batch_id, is_favorite) 
WHERE is_favorite = TRUE;

-- Create index for batch + shot_type queries (for grouping)
CREATE INDEX IF NOT EXISTS idx_repose_outputs_batch_shot 
ON public.repose_outputs(batch_id, shot_type);