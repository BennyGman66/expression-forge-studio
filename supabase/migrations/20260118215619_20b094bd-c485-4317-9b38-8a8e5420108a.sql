-- Add assigned_view column to repose_batch_items for manual view assignment
ALTER TABLE public.repose_batch_items 
ADD COLUMN IF NOT EXISTS assigned_view TEXT CHECK (assigned_view IN ('front', 'back'));

-- Add index for performance when filtering by assigned view
CREATE INDEX IF NOT EXISTS idx_repose_batch_items_assigned_view 
ON public.repose_batch_items(assigned_view) 
WHERE assigned_view IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.repose_batch_items.assigned_view IS 'Manually assigned view type (front/back) - takes priority over auto-detection';