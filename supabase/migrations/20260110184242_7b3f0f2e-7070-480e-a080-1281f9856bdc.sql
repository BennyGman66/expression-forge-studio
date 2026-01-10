-- Secure storage buckets with RLS policies
-- Note: Buckets remain public for read access (images need to be viewable)
-- But write/update/delete operations require authentication

-- Policy for authenticated users to upload to 'images' bucket
CREATE POLICY "Authenticated users can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images');

-- Policy for authenticated users to update their uploads in 'images' bucket
CREATE POLICY "Authenticated users can update images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'images');

-- Policy for authenticated users to delete images
CREATE POLICY "Authenticated users can delete images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'images');

-- Policy for authenticated users to upload to 'face-crops' bucket
CREATE POLICY "Authenticated users can upload face-crops"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'face-crops');

-- Policy for authenticated users to update face-crops
CREATE POLICY "Authenticated users can update face-crops"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'face-crops');

-- Policy for authenticated users to delete face-crops
CREATE POLICY "Authenticated users can delete face-crops"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'face-crops');

-- Policy for authenticated users to upload to 'reference-crops' bucket
CREATE POLICY "Authenticated users can upload reference-crops"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-crops');

-- Policy for authenticated users to update reference-crops
CREATE POLICY "Authenticated users can update reference-crops"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'reference-crops');

-- Policy for authenticated users to delete reference-crops
CREATE POLICY "Authenticated users can delete reference-crops"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'reference-crops');

-- Allow service role (edge functions) to manage storage
-- This is implicit as service role bypasses RLS