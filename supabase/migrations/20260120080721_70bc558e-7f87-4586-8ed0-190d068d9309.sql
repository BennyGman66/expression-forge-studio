-- Add column to track when an output started processing
ALTER TABLE public.repose_outputs ADD COLUMN IF NOT EXISTS started_running_at TIMESTAMPTZ;