-- Drop the existing check constraint FIRST
ALTER TABLE public.talent_looks 
DROP CONSTRAINT IF EXISTS talent_looks_product_type_check;

-- Update any existing values to match the new values
UPDATE public.talent_looks SET product_type = 'top' WHERE product_type = 'tops';
UPDATE public.talent_looks SET product_type = 'trousers' WHERE product_type = 'bottoms';

-- Add new check constraint matching UI values
ALTER TABLE public.talent_looks 
ADD CONSTRAINT talent_looks_product_type_check 
CHECK (product_type IS NULL OR product_type IN ('top', 'trousers'));