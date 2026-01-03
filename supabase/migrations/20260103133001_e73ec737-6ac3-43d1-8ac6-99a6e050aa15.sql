
-- Create enum types for job system
CREATE TYPE job_type AS ENUM (
  'PHOTOSHOP_FACE_APPLY',
  'RETOUCH_FINAL'
);

CREATE TYPE job_status AS ENUM (
  'OPEN',
  'ASSIGNED', 
  'IN_PROGRESS',
  'SUBMITTED',
  'NEEDS_CHANGES',
  'APPROVED',
  'CLOSED'
);

CREATE TYPE artifact_type AS ENUM (
  'LOOK_SOURCE',
  'LOOK_PREP', 
  'FACE_LIBRARY_REF',
  'PHOTOSHOP_OUTPUT',
  'REPOSE_VARIANT',
  'CLIENT_SELECTION',
  'RETOUCH_OUTPUT'
);

-- Create unified_artifacts table
CREATE TABLE public.unified_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  look_id UUID,
  type artifact_type NOT NULL,
  file_url TEXT NOT NULL,
  preview_url TEXT,
  source_table TEXT,
  source_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create unified_jobs table
CREATE TABLE public.unified_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  look_id UUID,
  type job_type NOT NULL,
  status job_status DEFAULT 'OPEN',
  assigned_user_id UUID REFERENCES public.users(id),
  due_date TIMESTAMPTZ,
  instructions TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create job_inputs table
CREATE TABLE public.job_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.unified_jobs(id) ON DELETE CASCADE NOT NULL,
  artifact_id UUID REFERENCES public.unified_artifacts(id),
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create job_outputs table
CREATE TABLE public.job_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.unified_jobs(id) ON DELETE CASCADE NOT NULL,
  artifact_id UUID REFERENCES public.unified_artifacts(id),
  file_url TEXT,
  label TEXT,
  uploaded_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create job_notes table
CREATE TABLE public.job_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.unified_jobs(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES public.users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create invites table
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.unified_jobs(id),
  project_id UUID,
  role app_role NOT NULL,
  token TEXT UNIQUE NOT NULL,
  pin_code TEXT,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create audit_events table
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  project_id UUID,
  job_id UUID,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.unified_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for unified_artifacts
CREATE POLICY "Internal users can manage artifacts"
ON public.unified_artifacts FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

-- RLS Policies for unified_jobs
CREATE POLICY "Internal users can manage all jobs"
ON public.unified_jobs FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view assigned jobs"
ON public.unified_jobs FOR SELECT
USING (
  has_role(auth.uid(), 'freelancer') AND assigned_user_id = auth.uid()
);

CREATE POLICY "Freelancers can update assigned jobs"
ON public.unified_jobs FOR UPDATE
USING (
  has_role(auth.uid(), 'freelancer') AND assigned_user_id = auth.uid()
);

-- RLS Policies for job_inputs
CREATE POLICY "Internal users can manage job inputs"
ON public.job_inputs FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view inputs for assigned jobs"
ON public.job_inputs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_id 
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- RLS Policies for job_outputs
CREATE POLICY "Internal users can manage job outputs"
ON public.job_outputs FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can manage outputs for assigned jobs"
ON public.job_outputs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_id 
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_id 
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- RLS Policies for job_notes
CREATE POLICY "Internal users can manage job notes"
ON public.job_notes FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can manage notes for assigned jobs"
ON public.job_notes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_id 
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_id 
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- RLS Policies for invites
CREATE POLICY "Internal users can manage invites"
ON public.invites FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Anyone can read invites by token"
ON public.invites FOR SELECT
USING (true);

-- RLS Policies for audit_events
CREATE POLICY "Internal users can view audit events"
ON public.audit_events FOR SELECT
USING (is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can insert audit events"
ON public.audit_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Add trigger for updated_at on unified_jobs
CREATE TRIGGER update_unified_jobs_updated_at
BEFORE UPDATE ON public.unified_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
