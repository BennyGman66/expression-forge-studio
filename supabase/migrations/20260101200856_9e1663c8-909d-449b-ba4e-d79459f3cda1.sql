-- Add linked_twin_id column to face_identities (link without archiving)
ALTER TABLE public.face_identities 
ADD COLUMN linked_twin_id UUID REFERENCES public.digital_twins(id) ON DELETE SET NULL;