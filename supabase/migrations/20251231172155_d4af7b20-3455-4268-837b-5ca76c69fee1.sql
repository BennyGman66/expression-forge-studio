-- Create storage bucket for reference crop images
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-crops', 'reference-crops', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public read access
CREATE POLICY "Public read access for reference-crops"
ON storage.objects
FOR SELECT
USING (bucket_id = 'reference-crops');