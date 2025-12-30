-- Face Creator: Scrape & Segment Models Tables

-- 1. Face scrape runs - Main scrape sessions
CREATE TABLE public.face_scrape_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name TEXT NOT NULL,
  start_url TEXT NOT NULL,
  max_products INTEGER NOT NULL DEFAULT 200,
  images_per_product INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Face scrape images - Raw scraped images
CREATE TABLE public.face_scrape_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID NOT NULL REFERENCES public.face_scrape_runs(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  stored_url TEXT,
  product_url TEXT,
  product_title TEXT,
  image_index INTEGER NOT NULL DEFAULT 0,
  image_hash TEXT,
  gender TEXT DEFAULT 'unknown',
  gender_source TEXT DEFAULT 'unknown',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Face detections - Face detection results per image
CREATE TABLE public.face_detections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_image_id UUID NOT NULL REFERENCES public.face_scrape_images(id) ON DELETE CASCADE,
  face_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  bounding_boxes JSONB DEFAULT '[]'::jsonb,
  primary_box_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Face identities - Clustered model identities
CREATE TABLE public.face_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID NOT NULL REFERENCES public.face_scrape_runs(id) ON DELETE CASCADE,
  gender TEXT NOT NULL,
  name TEXT NOT NULL,
  representative_image_id UUID REFERENCES public.face_scrape_images(id) ON DELETE SET NULL,
  image_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Face identity images - Junction table for identity-image mapping
CREATE TABLE public.face_identity_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identity_id UUID NOT NULL REFERENCES public.face_identities(id) ON DELETE CASCADE,
  scrape_image_id UUID NOT NULL REFERENCES public.face_scrape_images(id) ON DELETE CASCADE,
  view TEXT DEFAULT 'unknown',
  view_source TEXT DEFAULT 'auto',
  is_ignored BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(identity_id, scrape_image_id)
);

-- 6. Face crops - Head and shoulders crop data
CREATE TABLE public.face_crops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_image_id UUID NOT NULL REFERENCES public.face_scrape_images(id) ON DELETE CASCADE,
  crop_x INTEGER NOT NULL,
  crop_y INTEGER NOT NULL,
  crop_width INTEGER NOT NULL,
  crop_height INTEGER NOT NULL,
  aspect_ratio TEXT NOT NULL DEFAULT '1:1',
  cropped_stored_url TEXT,
  is_auto BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Face jobs - Background job tracking
CREATE TABLE public.face_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scrape_run_id UUID NOT NULL REFERENCES public.face_scrape_runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.face_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_scrape_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_identity_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_jobs ENABLE ROW LEVEL SECURITY;

-- Public access policies (matching existing app pattern)
CREATE POLICY "Public access to face_scrape_runs" ON public.face_scrape_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_scrape_images" ON public.face_scrape_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_detections" ON public.face_detections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_identities" ON public.face_identities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_identity_images" ON public.face_identity_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_crops" ON public.face_crops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_jobs" ON public.face_jobs FOR ALL USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_face_scrape_images_run ON public.face_scrape_images(scrape_run_id);
CREATE INDEX idx_face_scrape_images_hash ON public.face_scrape_images(image_hash);
CREATE INDEX idx_face_scrape_images_gender ON public.face_scrape_images(gender);
CREATE INDEX idx_face_detections_image ON public.face_detections(scrape_image_id);
CREATE INDEX idx_face_identities_run ON public.face_identities(scrape_run_id);
CREATE INDEX idx_face_identity_images_identity ON public.face_identity_images(identity_id);
CREATE INDEX idx_face_identity_images_image ON public.face_identity_images(scrape_image_id);
CREATE INDEX idx_face_crops_image ON public.face_crops(scrape_image_id);
CREATE INDEX idx_face_jobs_run ON public.face_jobs(scrape_run_id);

-- Triggers for updated_at
CREATE TRIGGER update_face_scrape_runs_updated_at
  BEFORE UPDATE ON public.face_scrape_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_face_crops_updated_at
  BEFORE UPDATE ON public.face_crops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_face_jobs_updated_at
  BEFORE UPDATE ON public.face_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for job tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_scrape_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.face_jobs;