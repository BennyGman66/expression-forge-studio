-- 1. Create production_projects table (parent grouping for batch uploads)
CREATE TABLE public.production_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand_id UUID REFERENCES public.brands(id),
  created_by_user_id UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create project_looks table (individual looks within a project)
CREATE TABLE public.project_looks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.production_projects(id) ON DELETE CASCADE,
  sku_code TEXT,
  look_name TEXT NOT NULL,
  source_files_json JSONB DEFAULT '{}'::jsonb,
  selected_talent_id UUID REFERENCES public.digital_talents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Add look_id to unified_jobs (project_id already exists)
ALTER TABLE public.unified_jobs
  ADD COLUMN IF NOT EXISTS look_id UUID REFERENCES public.project_looks(id);

-- 4. Add project_id to repose_batches
ALTER TABLE public.repose_batches
  ADD COLUMN project_id UUID REFERENCES public.production_projects(id);

-- 5. Enable RLS on new tables
ALTER TABLE public.production_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_looks ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for production_projects
CREATE POLICY "Internal users can manage production_projects"
  ON public.production_projects FOR ALL
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Public can view production_projects"
  ON public.production_projects FOR SELECT
  USING (true);

-- 7. RLS policies for project_looks
CREATE POLICY "Internal users can manage project_looks"
  ON public.project_looks FOR ALL
  USING (is_internal_user(auth.uid()))
  WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Public can view project_looks"
  ON public.project_looks FOR SELECT
  USING (true);

-- 8. Create indexes for efficient queries
CREATE INDEX idx_project_looks_project_id ON public.project_looks(project_id);
CREATE INDEX idx_unified_jobs_look_id ON public.unified_jobs(look_id);
CREATE INDEX idx_repose_batches_project_id ON public.repose_batches(project_id);

-- 9. Trigger for updated_at on production_projects
CREATE TRIGGER update_production_projects_updated_at
  BEFORE UPDATE ON public.production_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();