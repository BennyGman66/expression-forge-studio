-- Add time tracking columns for freelancer analytics
ALTER TABLE public.unified_jobs 
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_active_ms BIGINT DEFAULT 0;

-- Add index for freelancer queries
CREATE INDEX IF NOT EXISTS idx_unified_jobs_assigned_user ON public.unified_jobs(assigned_user_id) WHERE assigned_user_id IS NOT NULL;