-- Brand Pose Mapper Database Schema

-- Brands table
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scrape jobs table
CREATE TABLE public.scrape_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_url TEXT NOT NULL,
  sku TEXT,
  gender TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Product images table with slot enum
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('A', 'B', 'C', 'D')),
  source_url TEXT NOT NULL,
  stored_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Clay images table
CREATE TABLE public.clay_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_image_id UUID NOT NULL REFERENCES public.product_images(id) ON DELETE CASCADE,
  stored_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Talents table
CREATE TABLE public.talents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Talent images table
CREATE TABLE public.talent_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  talent_id UUID NOT NULL REFERENCES public.talents(id) ON DELETE CASCADE,
  view TEXT NOT NULL CHECK (view IN ('front', 'back', 'detail', 'side')),
  stored_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Generation jobs table
CREATE TABLE public.generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES public.talents(id) ON DELETE CASCADE,
  view TEXT NOT NULL,
  slot TEXT NOT NULL,
  random_count INTEGER DEFAULT 5,
  attempts_per_pose INTEGER DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Generations table (output images)
CREATE TABLE public.generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_job_id UUID NOT NULL REFERENCES public.generation_jobs(id) ON DELETE CASCADE,
  pose_clay_image_id UUID NOT NULL REFERENCES public.clay_images(id) ON DELETE CASCADE,
  attempt_index INTEGER NOT NULL,
  stored_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Prompt templates table
CREATE TABLE public.prompt_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default prompts
INSERT INTO public.prompt_templates (key, prompt) VALUES
('GRAYSCALE_CLAY_PROMPT', 'Convert this photo into a stylised 3D clay model render. Grey matte material, subtle polygonal mesh shading, simplified anatomy, smooth sculpted surfaces. Neutral studio lighting, no background texture. Replicate the exact pose and body orientation from the reference image. Maintain the proportions and overall silhouette exactly as in the original photo. No extra accessories, no background props, no face beautification.'),
('POSE_TRANSFER_PROMPT', 'Put the person from image 1 in the pose of image 2, with the outfit, lighting, camera framing, and identity of image 1. Keep the face and facial structure consistent with image 1. Do not change age, ethnicity, proportions, or facial features. Only change body pose to match image 2. Keep image 1''s styling and realism.');

-- Enable RLS on all tables
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clay_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required)
CREATE POLICY "Public access to brands" ON public.brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to scrape_jobs" ON public.scrape_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to product_images" ON public.product_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to clay_images" ON public.clay_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to talents" ON public.talents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to talent_images" ON public.talent_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to generation_jobs" ON public.generation_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to generations" ON public.generations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to prompt_templates" ON public.prompt_templates FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for job progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.scrape_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;

-- Create indexes for performance
CREATE INDEX idx_products_brand_id ON public.products(brand_id);
CREATE INDEX idx_products_gender ON public.products(gender);
CREATE INDEX idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX idx_product_images_slot ON public.product_images(slot);
CREATE INDEX idx_clay_images_product_image_id ON public.clay_images(product_image_id);
CREATE INDEX idx_talent_images_talent_id ON public.talent_images(talent_id);
CREATE INDEX idx_generations_job_id ON public.generations(generation_job_id);