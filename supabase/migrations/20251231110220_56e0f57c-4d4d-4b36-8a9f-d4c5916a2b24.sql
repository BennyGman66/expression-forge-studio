-- Create junction table for digital talent to brand associations
CREATE TABLE public.digital_talent_brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id UUID NOT NULL REFERENCES public.digital_talents(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(talent_id, brand_id)
);

-- Enable RLS
ALTER TABLE public.digital_talent_brands ENABLE ROW LEVEL SECURITY;

-- Public access policy
CREATE POLICY "Public access to digital_talent_brands" 
ON public.digital_talent_brands 
FOR ALL 
USING (true) 
WITH CHECK (true);