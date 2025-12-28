-- Projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  master_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Brand references table
CREATE TABLE public.brand_refs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Digital models table
CREATE TABLE public.digital_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Digital model reference images
CREATE TABLE public.digital_model_refs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  digital_model_id UUID NOT NULL REFERENCES public.digital_models(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Expression recipes table
CREATE TABLE public.expression_recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  recipe_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  delta_line TEXT,
  full_prompt_text TEXT,
  source_image_id UUID REFERENCES public.brand_refs(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Jobs table for background processing
CREATE TABLE public.jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Outputs table for generated images
CREATE TABLE public.outputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  digital_model_id UUID REFERENCES public.digital_models(id) ON DELETE CASCADE,
  recipe_id UUID REFERENCES public.expression_recipes(id) ON DELETE SET NULL,
  image_url TEXT,
  prompt_used TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metrics_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (public access for now, can add auth later)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_model_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expression_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

-- Public access policies (this is a tool, not multi-tenant for now)
CREATE POLICY "Public access to projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to brand_refs" ON public.brand_refs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to digital_models" ON public.digital_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to digital_model_refs" ON public.digital_model_refs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to expression_recipes" ON public.expression_recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to outputs" ON public.outputs FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);

-- Storage policies
CREATE POLICY "Public read access for images" ON storage.objects FOR SELECT USING (bucket_id = 'images');
CREATE POLICY "Public insert access for images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'images');
CREATE POLICY "Public update access for images" ON storage.objects FOR UPDATE USING (bucket_id = 'images');
CREATE POLICY "Public delete access for images" ON storage.objects FOR DELETE USING (bucket_id = 'images');

-- Indexes for performance
CREATE INDEX idx_brand_refs_project ON public.brand_refs(project_id);
CREATE INDEX idx_digital_models_project ON public.digital_models(project_id);
CREATE INDEX idx_digital_model_refs_model ON public.digital_model_refs(digital_model_id);
CREATE INDEX idx_expression_recipes_project ON public.expression_recipes(project_id);
CREATE INDEX idx_jobs_project ON public.jobs(project_id);
CREATE INDEX idx_outputs_project ON public.outputs(project_id);
CREATE INDEX idx_outputs_model ON public.outputs(digital_model_id);
CREATE INDEX idx_outputs_recipe ON public.outputs(recipe_id);