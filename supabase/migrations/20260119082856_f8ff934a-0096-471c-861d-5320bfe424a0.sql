-- Add exported_at column to track when each look was last exported
ALTER TABLE public.repose_batch_items 
ADD COLUMN IF NOT EXISTS exported_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;