-- Create table for storing reference crop images used for few-shot learning
CREATE TABLE public.crop_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  original_image_url TEXT NOT NULL,
  cropped_image_url TEXT NOT NULL,
  view_type TEXT NOT NULL DEFAULT 'front',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crop_reference_images ENABLE ROW LEVEL SECURITY;

-- Public access policy
CREATE POLICY "Public access to crop_reference_images" 
ON public.crop_reference_images 
FOR ALL 
USING (true) 
WITH CHECK (true);