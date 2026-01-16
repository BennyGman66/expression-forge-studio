-- Add crop_target column to product_images for distinguishing between top crops and trouser crops
ALTER TABLE product_images
ADD COLUMN crop_target TEXT CHECK (crop_target IS NULL OR crop_target IN ('top', 'trousers'));

-- Add index for efficient filtering
CREATE INDEX idx_product_images_crop_target ON product_images(crop_target) WHERE crop_target IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN product_images.crop_target IS 'For FRONT_CROPPED poses: top = waist-up crop, trousers = waist-down crop';