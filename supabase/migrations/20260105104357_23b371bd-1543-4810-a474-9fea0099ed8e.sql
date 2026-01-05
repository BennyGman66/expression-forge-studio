-- Add pipeline_job_id column to face_scrape_runs for tracking
ALTER TABLE public.face_scrape_runs 
ADD COLUMN IF NOT EXISTS pipeline_job_id uuid REFERENCES public.pipeline_jobs(id) ON DELETE SET NULL;