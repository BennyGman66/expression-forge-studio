-- Create job_groups table to track batches of jobs sent together
CREATE TABLE IF NOT EXISTS public.job_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.face_application_projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  total_looks INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to unified_jobs for handoff tracking
ALTER TABLE public.unified_jobs 
ADD COLUMN IF NOT EXISTS brief_snapshot TEXT,
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS job_group_id UUID REFERENCES public.job_groups(id) ON DELETE SET NULL;

-- Enable RLS on job_groups
ALTER TABLE public.job_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies for job_groups (internal users only)
CREATE POLICY "Internal users can view job_groups"
ON public.job_groups FOR SELECT
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create job_groups"
ON public.job_groups FOR INSERT
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update job_groups"
ON public.job_groups FOR UPDATE
USING (public.is_internal_user(auth.uid()));

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_unified_jobs_job_group_id ON public.unified_jobs(job_group_id);
CREATE INDEX IF NOT EXISTS idx_job_groups_project_id ON public.job_groups(project_id);