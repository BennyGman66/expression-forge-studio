-- Create talent_pairing_templates table for storing reusable pairings
CREATE TABLE public.talent_pairing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  digital_talent_id UUID NOT NULL REFERENCES public.digital_talents(id) ON DELETE CASCADE,
  digital_twin_id UUID REFERENCES public.digital_twins(id) ON DELETE SET NULL,
  face_identity_id UUID REFERENCES public.face_identities(id) ON DELETE SET NULL,
  scrape_run_id UUID REFERENCES public.face_scrape_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  
  -- Ensure at least one source is specified
  CONSTRAINT check_source_exists CHECK (digital_twin_id IS NOT NULL OR face_identity_id IS NOT NULL)
);

-- Enable RLS
ALTER TABLE public.talent_pairing_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies (allow all operations for authenticated users)
CREATE POLICY "Allow all operations on talent_pairing_templates"
ON public.talent_pairing_templates
FOR ALL
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_pairing_templates_digital_talent ON public.talent_pairing_templates(digital_talent_id);
CREATE INDEX idx_pairing_templates_digital_twin ON public.talent_pairing_templates(digital_twin_id);
CREATE INDEX idx_pairing_templates_face_identity ON public.talent_pairing_templates(face_identity_id);
CREATE INDEX idx_pairing_templates_scrape_run ON public.talent_pairing_templates(scrape_run_id);