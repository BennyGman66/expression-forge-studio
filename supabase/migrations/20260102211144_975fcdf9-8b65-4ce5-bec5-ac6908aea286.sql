-- Create face_application_projects table
CREATE TABLE public.face_application_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.face_application_projects ENABLE ROW LEVEL SECURITY;

-- Create public access policy
CREATE POLICY "Public access to face_application_projects"
ON public.face_application_projects
FOR ALL
USING (true)
WITH CHECK (true);

-- Add project_id to talent_looks
ALTER TABLE public.talent_looks 
ADD COLUMN project_id UUID REFERENCES public.face_application_projects(id);

-- Add project_id to face_application_jobs
ALTER TABLE public.face_application_jobs 
ADD COLUMN project_id UUID REFERENCES public.face_application_projects(id);

-- Create trigger for updated_at
CREATE TRIGGER update_face_application_projects_updated_at
BEFORE UPDATE ON public.face_application_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();