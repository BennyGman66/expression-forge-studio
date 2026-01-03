-- Phase 1: Create Repose Production tables

-- 1. Repose Batches (one per approved job, enforced by UNIQUE constraint)
CREATE TABLE public.repose_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE REFERENCES public.unified_jobs(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  config_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add check constraint for status
ALTER TABLE public.repose_batches ADD CONSTRAINT repose_batches_status_check 
  CHECK (status IN ('DRAFT', 'RUNNING', 'COMPLETE', 'FAILED'));

-- 2. Batch Items (approved outputs grouped by look/view)
CREATE TABLE public.repose_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.repose_batches(id) ON DELETE CASCADE,
  look_id UUID,
  view TEXT NOT NULL,
  source_output_id UUID REFERENCES public.job_outputs(id),
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Repose Outputs (generated results)
CREATE TABLE public.repose_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.repose_batches(id) ON DELETE CASCADE,
  batch_item_id UUID NOT NULL REFERENCES public.repose_batch_items(id) ON DELETE CASCADE,
  pose_id UUID REFERENCES public.clay_images(id),
  slot TEXT,
  attempt_index INTEGER DEFAULT 0,
  result_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add check constraint for status
ALTER TABLE public.repose_outputs ADD CONSTRAINT repose_outputs_status_check 
  CHECK (status IN ('queued', 'running', 'complete', 'failed'));

-- Enable RLS
ALTER TABLE public.repose_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repose_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repose_outputs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for repose_batches
CREATE POLICY "Internal users can manage repose_batches"
ON public.repose_batches FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view batches for their jobs"
ON public.repose_batches FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j
    WHERE j.id = repose_batches.job_id
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- RLS Policies for repose_batch_items
CREATE POLICY "Internal users can manage repose_batch_items"
ON public.repose_batch_items FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view batch items for their jobs"
ON public.repose_batch_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.repose_batches b
    JOIN public.unified_jobs j ON j.id = b.job_id
    WHERE b.id = repose_batch_items.batch_id
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- RLS Policies for repose_outputs
CREATE POLICY "Internal users can manage repose_outputs"
ON public.repose_outputs FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view outputs for their jobs"
ON public.repose_outputs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.repose_batches b
    JOIN public.unified_jobs j ON j.id = b.job_id
    WHERE b.id = repose_outputs.batch_id
    AND j.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);

-- Trigger for updated_at on repose_batches
CREATE TRIGGER update_repose_batches_updated_at
BEFORE UPDATE ON public.repose_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.repose_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.repose_outputs;