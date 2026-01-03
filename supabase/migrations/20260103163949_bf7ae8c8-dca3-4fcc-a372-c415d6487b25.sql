-- Add title and priority columns to unified_jobs
ALTER TABLE public.unified_jobs ADD COLUMN title text;
ALTER TABLE public.unified_jobs ADD COLUMN priority integer DEFAULT 2;