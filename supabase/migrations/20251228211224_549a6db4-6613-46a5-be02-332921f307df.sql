-- Add product_type column to products table
ALTER TABLE public.products 
ADD COLUMN product_type text;