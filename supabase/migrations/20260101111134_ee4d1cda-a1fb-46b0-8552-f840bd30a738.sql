-- Create table to store learning data from manual crop corrections
CREATE TABLE public.crop_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_image_id UUID NOT NULL REFERENCES public.face_scrape_images(id) ON DELETE CASCADE,
  scrape_run_id UUID NOT NULL REFERENCES public.face_scrape_runs(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL DEFAULT 'front',
  
  -- What the AI originally suggested (percentages)
  ai_crop_x NUMERIC NOT NULL,
  ai_crop_y NUMERIC NOT NULL,
  ai_crop_width NUMERIC NOT NULL,
  ai_crop_height NUMERIC NOT NULL,
  
  -- What the user corrected to (percentages)
  user_crop_x NUMERIC NOT NULL,
  user_crop_y NUMERIC NOT NULL,
  user_crop_width NUMERIC NOT NULL,
  user_crop_height NUMERIC NOT NULL,
  
  -- Pre-calculated deltas for easy querying
  delta_x NUMERIC GENERATED ALWAYS AS (user_crop_x - ai_crop_x) STORED,
  delta_y NUMERIC GENERATED ALWAYS AS (user_crop_y - ai_crop_y) STORED,
  delta_width NUMERIC GENERATED ALWAYS AS (user_crop_width - ai_crop_width) STORED,
  delta_height NUMERIC GENERATED ALWAYS AS (user_crop_height - ai_crop_height) STORED,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crop_corrections ENABLE ROW LEVEL SECURITY;

-- Public access policy (matching other face_ tables)
CREATE POLICY "Public access to crop_corrections" 
ON public.crop_corrections 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Index for efficient querying by view type and recency
CREATE INDEX idx_crop_corrections_view_type ON public.crop_corrections(view_type, created_at DESC);
CREATE INDEX idx_crop_corrections_scrape_run ON public.crop_corrections(scrape_run_id, created_at DESC);