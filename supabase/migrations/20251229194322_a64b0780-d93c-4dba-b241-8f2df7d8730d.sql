-- Make password_hash nullable to allow reviews without password protection
ALTER TABLE public.client_reviews ALTER COLUMN password_hash DROP NOT NULL;