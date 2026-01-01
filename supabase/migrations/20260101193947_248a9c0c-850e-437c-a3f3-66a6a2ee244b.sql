-- Create digital_twins table
CREATE TABLE public.digital_twins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gender TEXT,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  representative_image_url TEXT,
  source_scrape_run_id UUID REFERENCES public.face_scrape_runs(id) ON DELETE SET NULL,
  image_count INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create digital_twin_images table
CREATE TABLE public.digital_twin_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id UUID NOT NULL REFERENCES public.digital_twins(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  stored_url TEXT,
  view TEXT DEFAULT 'unknown',
  crop_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add archive fields to face_identities
ALTER TABLE public.face_identities 
ADD COLUMN archived_to_twin_id UUID REFERENCES public.digital_twins(id) ON DELETE SET NULL,
ADD COLUMN archived_at TIMESTAMPTZ;

-- Enable RLS
ALTER TABLE public.digital_twins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_twin_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for digital_twins
CREATE POLICY "Public access to digital_twins" 
ON public.digital_twins 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- RLS policies for digital_twin_images
CREATE POLICY "Public access to digital_twin_images" 
ON public.digital_twin_images 
FOR ALL 
USING (true) 
WITH CHECK (true);