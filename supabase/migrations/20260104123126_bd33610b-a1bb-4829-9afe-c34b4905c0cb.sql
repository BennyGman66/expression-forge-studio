-- Create enum types for pipeline jobs
CREATE TYPE pipeline_job_type AS ENUM (
  'SCRAPE_BRAND',
  'SCRAPE_FACES',
  'CLAY_GENERATION',
  'POSE_GENERATION',
  'FACE_GENERATION',
  'FACE_PAIRING',
  'CROP_GENERATION',
  'ORGANIZE_IMAGES',
  'OTHER'
);

CREATE TYPE pipeline_job_status AS ENUM (
  'QUEUED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELED'
);

-- Create the unified pipeline_jobs table
CREATE TABLE public.pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core fields
  type pipeline_job_type NOT NULL,
  title TEXT NOT NULL,
  status pipeline_job_status NOT NULL DEFAULT 'QUEUED',
  
  -- Progress tracking
  progress_total INTEGER NOT NULL DEFAULT 0,
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_failed INTEGER NOT NULL DEFAULT 0,
  progress_message TEXT,
  
  -- User/timing
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Navigation context
  origin_route TEXT NOT NULL,
  origin_context JSONB DEFAULT '{}',
  
  -- Feature flags
  supports_pause BOOLEAN DEFAULT FALSE,
  supports_retry BOOLEAN DEFAULT FALSE,
  supports_restart BOOLEAN DEFAULT TRUE,
  
  -- Link to source job tables
  source_table TEXT,
  source_job_id UUID
);

-- Create pipeline_job_events table for detailed logging
CREATE TABLE public.pipeline_job_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.pipeline_jobs(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_pipeline_jobs_status ON public.pipeline_jobs(status);
CREATE INDEX idx_pipeline_jobs_created_by ON public.pipeline_jobs(created_by);
CREATE INDEX idx_pipeline_jobs_created_at ON public.pipeline_jobs(created_at DESC);
CREATE INDEX idx_pipeline_job_events_job_id ON public.pipeline_job_events(job_id);

-- Trigger for updated_at
CREATE TRIGGER update_pipeline_jobs_updated_at
  BEFORE UPDATE ON public.pipeline_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_job_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pipeline_jobs
CREATE POLICY "Internal users can view pipeline_jobs"
ON public.pipeline_jobs FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert pipeline_jobs"
ON public.pipeline_jobs FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update pipeline_jobs"
ON public.pipeline_jobs FOR UPDATE
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete pipeline_jobs"
ON public.pipeline_jobs FOR DELETE
USING (is_internal_user(auth.uid()));

-- RLS Policies for pipeline_job_events
CREATE POLICY "Internal users can view pipeline_job_events"
ON public.pipeline_job_events FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Internal users can insert pipeline_job_events"
ON public.pipeline_job_events FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_jobs;