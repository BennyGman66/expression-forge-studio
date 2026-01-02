-- Store fit model "Look" source images before face application
CREATE TABLE look_source_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id UUID NOT NULL,
  digital_talent_id UUID,
  view TEXT NOT NULL CHECK (view IN ('front', 'back', 'side', 'detail')),
  source_url TEXT NOT NULL,
  head_crop_x INTEGER,
  head_crop_y INTEGER,
  head_crop_width INTEGER,
  head_crop_height INTEGER,
  head_cropped_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Track face application generation jobs
CREATE TABLE face_application_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id UUID NOT NULL,
  digital_talent_id UUID NOT NULL,
  status TEXT DEFAULT 'pending',
  model TEXT DEFAULT 'google/gemini-2.5-flash-image-preview',
  attempts_per_view INTEGER DEFAULT 3,
  progress INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  logs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Store face application generation outputs
CREATE TABLE face_application_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES face_application_jobs(id) ON DELETE CASCADE,
  look_source_image_id UUID REFERENCES look_source_images(id),
  face_foundation_url TEXT,
  view TEXT NOT NULL,
  attempt_index INTEGER DEFAULT 0,
  outfit_description TEXT,
  final_prompt TEXT,
  stored_url TEXT,
  status TEXT DEFAULT 'pending',
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies for public access
ALTER TABLE look_source_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_application_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_application_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to look_source_images" ON look_source_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_application_jobs" ON face_application_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to face_application_outputs" ON face_application_outputs FOR ALL USING (true) WITH CHECK (true);