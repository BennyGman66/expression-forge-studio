-- Create digital_talents table
CREATE TABLE public.digital_talents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  front_face_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_talents ENABLE ROW LEVEL SECURITY;

-- Create public access policy
CREATE POLICY "Public access to digital_talents" 
ON public.digital_talents 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create digital_talent_assets table for future expansion
CREATE TABLE public.digital_talent_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id UUID NOT NULL REFERENCES public.digital_talents(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL DEFAULT 'front_face',
  stored_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.digital_talent_assets ENABLE ROW LEVEL SECURITY;

-- Create public access policy
CREATE POLICY "Public access to digital_talent_assets" 
ON public.digital_talent_assets 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add digital_talent_id to talent_looks
ALTER TABLE public.talent_looks 
ADD COLUMN digital_talent_id UUID REFERENCES public.digital_talents(id) ON DELETE SET NULL;

-- Add digital_talent_id to face_pairings for tracking
ALTER TABLE public.face_pairings 
ADD COLUMN digital_talent_id UUID REFERENCES public.digital_talents(id) ON DELETE SET NULL;

-- Migrate existing talents to digital_talents
INSERT INTO public.digital_talents (id, name, gender, front_face_url, created_at)
SELECT 
  t.id,
  t.name,
  t.gender,
  (
    SELECT ti.stored_url 
    FROM public.talent_images ti 
    JOIN public.talent_looks tl ON ti.look_id = tl.id 
    WHERE tl.talent_id = t.id AND ti.view = 'front' 
    LIMIT 1
  ),
  t.created_at
FROM public.talents t;

-- Link existing looks to their digital talents
UPDATE public.talent_looks 
SET digital_talent_id = talent_id;