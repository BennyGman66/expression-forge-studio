-- Set REPLICA IDENTITY FULL for better realtime updates
ALTER TABLE public.unified_jobs REPLICA IDENTITY FULL;

-- Also set on job_submissions for submission status changes
ALTER TABLE public.job_submissions REPLICA IDENTITY FULL;