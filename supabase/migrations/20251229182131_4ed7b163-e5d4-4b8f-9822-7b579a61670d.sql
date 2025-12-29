-- Add unique constraint to prevent duplicate clay images for the same product_image
-- First, clean up existing duplicates by keeping only the most recent one
DELETE FROM clay_images
WHERE id NOT IN (
  SELECT DISTINCT ON (product_image_id) id
  FROM clay_images
  ORDER BY product_image_id, created_at DESC
);

-- Add unique constraint
ALTER TABLE clay_images
ADD CONSTRAINT clay_images_product_image_id_unique UNIQUE (product_image_id);