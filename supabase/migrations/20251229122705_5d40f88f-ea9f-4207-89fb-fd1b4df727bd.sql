-- Create table for locked-in expression map exports
CREATE TABLE public.expression_map_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expression_map_exports ENABLE ROW LEVEL SECURITY;

-- Public access policy (matching existing pattern)
CREATE POLICY "Public access to expression_map_exports" 
ON public.expression_map_exports 
FOR ALL 
USING (true) 
WITH CHECK (true);