-- =====================================================
-- BRAND POSE LIBRARY VERSIONING SCHEMA
-- =====================================================

-- 1. Create brand_pose_libraries table (versioned library containers)
CREATE TABLE public.brand_pose_libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'locked')),
  config_json JSONB DEFAULT '{"min_poses_per_slot": 50}'::jsonb,
  locked_at TIMESTAMPTZ,
  locked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, version)
);

-- 2. Create library_poses table (links clay_images to library versions with curation state)
CREATE TABLE public.library_poses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID NOT NULL REFERENCES public.brand_pose_libraries(id) ON DELETE CASCADE,
  clay_image_id UUID NOT NULL REFERENCES public.clay_images(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('A', 'B', 'C', 'D')),
  gender TEXT CHECK (gender IN ('women', 'men')),
  product_type TEXT CHECK (product_type IN ('tops', 'trousers')),
  curation_status TEXT NOT NULL DEFAULT 'pending' CHECK (curation_status IN ('pending', 'included', 'excluded', 'failed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(library_id, clay_image_id)
);

-- 3. Enable RLS
ALTER TABLE public.brand_pose_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_poses ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for brand_pose_libraries
CREATE POLICY "Internal users can manage brand_pose_libraries"
ON public.brand_pose_libraries
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Public can view brand_pose_libraries"
ON public.brand_pose_libraries
FOR SELECT
USING (true);

-- 5. RLS Policies for library_poses
CREATE POLICY "Internal users can manage library_poses"
ON public.library_poses
FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Public can view library_poses"
ON public.library_poses
FOR SELECT
USING (true);

-- 6. Enable realtime for library_poses
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_poses;

-- 7. Create indexes for performance
CREATE INDEX idx_brand_pose_libraries_brand_id ON public.brand_pose_libraries(brand_id);
CREATE INDEX idx_brand_pose_libraries_status ON public.brand_pose_libraries(status);
CREATE INDEX idx_library_poses_library_id ON public.library_poses(library_id);
CREATE INDEX idx_library_poses_curation_status ON public.library_poses(curation_status);
CREATE INDEX idx_library_poses_slot_gender ON public.library_poses(slot, gender);

-- 8. Updated_at trigger for brand_pose_libraries
CREATE TRIGGER update_brand_pose_libraries_updated_at
BEFORE UPDATE ON public.brand_pose_libraries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Updated_at trigger for library_poses
CREATE TRIGGER update_library_poses_updated_at
BEFORE UPDATE ON public.library_poses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 10. Helper function to initialize library from existing clay poses
CREATE OR REPLACE FUNCTION public.initialize_library_from_clay_poses(
  p_library_id UUID,
  p_brand_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.library_poses (
    library_id,
    clay_image_id,
    slot,
    gender,
    product_type,
    curation_status
  )
  SELECT 
    p_library_id,
    ci.id,
    pi.slot,
    pr.gender,
    pr.product_type,
    'pending'
  FROM public.clay_images ci
  JOIN public.product_images pi ON ci.product_image_id = pi.id
  JOIN public.products pr ON pi.product_id = pr.id
  WHERE pr.brand_id = p_brand_id
  ON CONFLICT (library_id, clay_image_id) DO NOTHING;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;