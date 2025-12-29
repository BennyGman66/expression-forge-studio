-- Add product_type column to talent_looks table
ALTER TABLE public.talent_looks ADD COLUMN product_type text;

-- Add a check constraint for valid values
ALTER TABLE public.talent_looks ADD CONSTRAINT talent_looks_product_type_check 
CHECK (product_type IS NULL OR product_type IN ('tops', 'bottoms'));