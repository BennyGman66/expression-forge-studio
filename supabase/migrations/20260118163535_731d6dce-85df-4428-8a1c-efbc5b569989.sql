-- Add attachment_url column to review_comments
ALTER TABLE review_comments 
ADD COLUMN IF NOT EXISTS attachment_url text;

-- Create storage bucket for comment attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('comment-attachments', 'comment-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: authenticated users can upload
CREATE POLICY "Auth users can upload comment attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comment-attachments');

-- RLS policy: anyone can view attachments
CREATE POLICY "Anyone can view comment attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'comment-attachments');