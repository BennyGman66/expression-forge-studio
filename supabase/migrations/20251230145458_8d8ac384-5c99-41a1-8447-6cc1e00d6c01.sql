-- Create face-crops storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-crops', 'face-crops', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for face-crops"
ON storage.objects FOR SELECT
USING (bucket_id = 'face-crops');

-- Allow authenticated insert
CREATE POLICY "Public insert access for face-crops"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'face-crops');

-- Allow public update
CREATE POLICY "Public update access for face-crops"
ON storage.objects FOR UPDATE
USING (bucket_id = 'face-crops');

-- Allow public delete
CREATE POLICY "Public delete access for face-crops"
ON storage.objects FOR DELETE
USING (bucket_id = 'face-crops');