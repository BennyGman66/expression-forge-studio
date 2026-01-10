-- AI Apply Jobs table - tracks job state per project/look
CREATE TABLE public.ai_apply_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.face_application_projects(id) ON DELETE CASCADE,
  look_id UUID REFERENCES public.talent_looks(id) ON DELETE CASCADE,
  digital_talent_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
  model TEXT DEFAULT 'google/gemini-2.5-flash-image-preview',
  attempts_per_view INTEGER DEFAULT 4,
  strictness TEXT DEFAULT 'high' CHECK (strictness IN ('high', 'medium', 'low')),
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  pipeline_job_id UUID REFERENCES public.pipeline_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Apply Outputs table - stores generated AI outputs per view
CREATE TABLE public.ai_apply_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.ai_apply_jobs(id) ON DELETE CASCADE,
  look_id UUID REFERENCES public.talent_looks(id) ON DELETE CASCADE,
  view TEXT NOT NULL CHECK (view IN ('full_front', 'cropped_front', 'back', 'detail')),
  attempt_index INTEGER DEFAULT 0,
  head_image_id UUID,
  head_image_url TEXT,
  body_image_id UUID,
  body_image_url TEXT,
  prompt_version TEXT DEFAULT 'v1',
  final_prompt TEXT,
  stored_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  is_selected BOOLEAN DEFAULT false,
  needs_human_fix BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI Apply Prompt Templates table - centralized prompt management
CREATE TABLE public.ai_apply_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, version)
);

-- Insert the default identity lock template
INSERT INTO public.ai_apply_prompt_templates (name, version, template) VALUES (
  'identity_lock',
  'v1',
  'Using the provided head image as the sole identity authority; preserve exact facial identity with zero deviation (structure, tone, texture, freckles). No beautify/smooth.

Using the provided body image as full-body authority; preserve pose, proportions, clothing, crop, and silhouette exactly; no redesign.

Replace head naturally; match perspective and angle to the body so the subject appears coherent.

Preserve studio lighting and background from body image.'
);

-- Enable RLS
ALTER TABLE public.ai_apply_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_apply_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_apply_prompt_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public access to ai_apply_jobs" ON public.ai_apply_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to ai_apply_outputs" ON public.ai_apply_outputs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to ai_apply_prompt_templates" ON public.ai_apply_prompt_templates FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_ai_apply_jobs_project_id ON public.ai_apply_jobs(project_id);
CREATE INDEX idx_ai_apply_jobs_look_id ON public.ai_apply_jobs(look_id);
CREATE INDEX idx_ai_apply_jobs_status ON public.ai_apply_jobs(status);
CREATE INDEX idx_ai_apply_outputs_job_id ON public.ai_apply_outputs(job_id);
CREATE INDEX idx_ai_apply_outputs_look_id ON public.ai_apply_outputs(look_id);
CREATE INDEX idx_ai_apply_outputs_view ON public.ai_apply_outputs(view);
CREATE INDEX idx_ai_apply_outputs_status ON public.ai_apply_outputs(status);

-- Trigger for updated_at
CREATE TRIGGER update_ai_apply_jobs_updated_at
  BEFORE UPDATE ON public.ai_apply_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();