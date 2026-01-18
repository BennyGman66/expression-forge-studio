-- Optimised Workflow: Isolated Database Schema
-- This creates completely new tables that don't affect existing functionality

-- Create workflow stage enum (extensible for future stages)
CREATE TYPE workflow_stage AS ENUM (
  'LOOKS_UPLOADED',
  'MODEL_PAIRED', 
  'HEADS_CROPPED',
  'FACE_MATCHED',
  'GENERATED',
  'REVIEW_SELECTED',
  'JOB_BOARD',
  'DONE'
);

-- Create workflow_projects table
CREATE TABLE public.workflow_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create workflow_looks table
CREATE TABLE public.workflow_looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.workflow_projects(id) ON DELETE CASCADE,
  look_code text NOT NULL,
  name text,
  stage workflow_stage DEFAULT 'LOOKS_UPLOADED',
  stage_updated_at timestamptz DEFAULT now(),
  digital_talent_id uuid REFERENCES public.digital_talents(id) ON DELETE SET NULL,
  generation_run_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, look_code)
);

-- Create index for fast filtering by project and stage
CREATE INDEX idx_workflow_looks_project_stage ON public.workflow_looks(project_id, stage);

-- Create workflow_images table
CREATE TABLE public.workflow_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id uuid NOT NULL REFERENCES public.workflow_looks(id) ON DELETE CASCADE,
  view text NOT NULL, -- 'full_front', 'cropped_front', 'back', 'detail', 'side'
  original_url text NOT NULL,
  converted_url text,
  file_checksum text,
  filename text,
  head_cropped_url text,
  matched_face_url text,
  matched_foundation_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(look_id, view, file_checksum)
);

CREATE INDEX idx_workflow_images_look ON public.workflow_images(look_id);

-- Create workflow_outputs table
CREATE TABLE public.workflow_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id uuid NOT NULL REFERENCES public.workflow_looks(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.workflow_images(id) ON DELETE SET NULL,
  view text NOT NULL,
  output_url text,
  status text DEFAULT 'queued', -- queued, running, completed, failed
  is_selected boolean DEFAULT false,
  selection_order integer,
  generation_run integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_workflow_outputs_look ON public.workflow_outputs(look_id);
CREATE INDEX idx_workflow_outputs_status ON public.workflow_outputs(status);

-- Create workflow_queue table for generation jobs
CREATE TABLE public.workflow_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.workflow_projects(id) ON DELETE CASCADE,
  look_id uuid REFERENCES public.workflow_looks(id) ON DELETE CASCADE,
  image_id uuid REFERENCES public.workflow_images(id) ON DELETE SET NULL,
  view text,
  job_type text DEFAULT 'generate', -- generate, crop, match, etc.
  status text DEFAULT 'queued', -- queued, running, completed, failed, stalled
  priority integer DEFAULT 0,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  metadata jsonb DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_workflow_queue_status ON public.workflow_queue(status);
CREATE INDEX idx_workflow_queue_project ON public.workflow_queue(project_id, status);

-- Enable RLS on all tables
ALTER TABLE public.workflow_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_projects
CREATE POLICY "Internal users can view workflow projects" 
ON public.workflow_projects FOR SELECT 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create workflow projects" 
ON public.workflow_projects FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update workflow projects" 
ON public.workflow_projects FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete workflow projects" 
ON public.workflow_projects FOR DELETE 
USING (public.is_internal_user(auth.uid()));

-- RLS Policies for workflow_looks
CREATE POLICY "Internal users can view workflow looks" 
ON public.workflow_looks FOR SELECT 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create workflow looks" 
ON public.workflow_looks FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update workflow looks" 
ON public.workflow_looks FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete workflow looks" 
ON public.workflow_looks FOR DELETE 
USING (public.is_internal_user(auth.uid()));

-- RLS Policies for workflow_images
CREATE POLICY "Internal users can view workflow images" 
ON public.workflow_images FOR SELECT 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create workflow images" 
ON public.workflow_images FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update workflow images" 
ON public.workflow_images FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete workflow images" 
ON public.workflow_images FOR DELETE 
USING (public.is_internal_user(auth.uid()));

-- RLS Policies for workflow_outputs
CREATE POLICY "Internal users can view workflow outputs" 
ON public.workflow_outputs FOR SELECT 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create workflow outputs" 
ON public.workflow_outputs FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update workflow outputs" 
ON public.workflow_outputs FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete workflow outputs" 
ON public.workflow_outputs FOR DELETE 
USING (public.is_internal_user(auth.uid()));

-- RLS Policies for workflow_queue
CREATE POLICY "Internal users can view workflow queue" 
ON public.workflow_queue FOR SELECT 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can create workflow queue items" 
ON public.workflow_queue FOR INSERT 
WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can update workflow queue" 
ON public.workflow_queue FOR UPDATE 
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Internal users can delete workflow queue items" 
ON public.workflow_queue FOR DELETE 
USING (public.is_internal_user(auth.uid()));

-- Add update triggers for updated_at columns
CREATE TRIGGER update_workflow_projects_updated_at
BEFORE UPDATE ON public.workflow_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_looks_updated_at
BEFORE UPDATE ON public.workflow_looks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_images_updated_at
BEFORE UPDATE ON public.workflow_images
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_outputs_updated_at
BEFORE UPDATE ON public.workflow_outputs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();