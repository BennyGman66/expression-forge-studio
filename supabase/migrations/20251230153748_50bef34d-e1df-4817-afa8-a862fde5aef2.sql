-- Create table for face pairing batches/jobs
CREATE TABLE public.face_pairing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID REFERENCES public.face_scrape_runs(id),
  name TEXT NOT NULL DEFAULT 'Untitled Batch',
  pairing_mode TEXT NOT NULL DEFAULT 'one-to-one', -- one-to-one, one-to-many, many-to-one, many-to-many
  status TEXT NOT NULL DEFAULT 'pending', -- pending, describing, generating, completed, failed
  total_pairings INTEGER DEFAULT 0,
  progress INTEGER DEFAULT 0,
  attempts_per_pairing INTEGER DEFAULT 1,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for individual pairings
CREATE TABLE public.face_pairings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.face_pairing_jobs(id) ON DELETE CASCADE,
  cropped_face_id UUID NOT NULL REFERENCES public.face_scrape_images(id),
  talent_id UUID NOT NULL REFERENCES public.talents(id),
  talent_image_id UUID NOT NULL REFERENCES public.talent_images(id),
  outfit_description TEXT,
  outfit_description_status TEXT DEFAULT 'pending', -- pending, completed, failed
  status TEXT NOT NULL DEFAULT 'pending', -- pending, generating, completed, failed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for generated outputs
CREATE TABLE public.face_pairing_outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pairing_id UUID NOT NULL REFERENCES public.face_pairings(id) ON DELETE CASCADE,
  attempt_index INTEGER NOT NULL DEFAULT 0,
  final_prompt TEXT,
  stored_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.face_pairing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_pairing_outputs ENABLE ROW LEVEL SECURITY;

-- Create public access policies (matching existing pattern)
CREATE POLICY "Public access to face_pairing_jobs" 
ON public.face_pairing_jobs 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Public access to face_pairings" 
ON public.face_pairings 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Public access to face_pairing_outputs" 
ON public.face_pairing_outputs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_face_pairings_job_id ON public.face_pairings(job_id);
CREATE INDEX idx_face_pairings_cropped_face_id ON public.face_pairings(cropped_face_id);
CREATE INDEX idx_face_pairings_talent_id ON public.face_pairings(talent_id);
CREATE INDEX idx_face_pairing_outputs_pairing_id ON public.face_pairing_outputs(pairing_id);
CREATE INDEX idx_face_pairing_jobs_status ON public.face_pairing_jobs(status);