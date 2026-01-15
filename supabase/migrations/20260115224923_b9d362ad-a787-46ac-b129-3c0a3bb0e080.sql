-- Add matched_face_url to store the paired face foundation URL
ALTER TABLE public.look_source_images 
ADD COLUMN IF NOT EXISTS matched_face_url TEXT;

-- Add is_skipped to track skipped images in face matching
ALTER TABLE public.look_source_images 
ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN DEFAULT false;