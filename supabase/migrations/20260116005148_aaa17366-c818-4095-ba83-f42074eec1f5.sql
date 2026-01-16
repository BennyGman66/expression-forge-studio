
-- Drop the old check constraint and add a new one that includes 'front'
ALTER TABLE ai_apply_outputs DROP CONSTRAINT ai_apply_outputs_view_check;

ALTER TABLE ai_apply_outputs ADD CONSTRAINT ai_apply_outputs_view_check 
  CHECK (view = ANY (ARRAY['front'::text, 'full_front'::text, 'cropped_front'::text, 'back'::text, 'detail'::text, 'side'::text]));

-- Now update all full_front entries to 'front'
UPDATE ai_apply_outputs 
SET view = 'front'
WHERE view = 'full_front';
