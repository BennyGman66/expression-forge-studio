-- Create table to track skipped shot types per look
CREATE TABLE IF NOT EXISTS public.repose_skipped_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.repose_batches(id) ON DELETE CASCADE,
  look_id UUID NOT NULL,
  shot_type TEXT NOT NULL,
  skipped_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  skipped_by UUID REFERENCES auth.users(id),
  UNIQUE(batch_id, look_id, shot_type)
);

-- Enable RLS
ALTER TABLE public.repose_skipped_views ENABLE ROW LEVEL SECURITY;

-- Create policy for internal users
CREATE POLICY "Internal users can manage skipped views"
ON public.repose_skipped_views
FOR ALL
USING (public.is_internal_user(auth.uid()))
WITH CHECK (public.is_internal_user(auth.uid()));