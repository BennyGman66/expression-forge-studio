-- Create talent_looks table for multiple looks per talent
CREATE TABLE public.talent_looks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id uuid NOT NULL REFERENCES public.talents(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.talent_looks ENABLE ROW LEVEL SECURITY;

-- Public access policy (matching existing pattern)
CREATE POLICY "Public access to talent_looks" ON public.talent_looks
FOR ALL USING (true) WITH CHECK (true);

-- Add look_id to talent_images (nullable for migration, but new images will use it)
ALTER TABLE public.talent_images ADD COLUMN look_id uuid REFERENCES public.talent_looks(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_talent_looks_talent_id ON public.talent_looks(talent_id);
CREATE INDEX idx_talent_images_look_id ON public.talent_images(look_id);