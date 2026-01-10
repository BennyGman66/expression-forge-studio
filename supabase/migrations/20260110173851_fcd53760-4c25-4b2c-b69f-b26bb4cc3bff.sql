-- Add access_token column to unified_jobs for shareable links
ALTER TABLE unified_jobs 
ADD COLUMN IF NOT EXISTS access_token TEXT UNIQUE;

-- Create index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_unified_jobs_access_token ON unified_jobs(access_token);

-- Create freelancer_identities table for name-based identity tracking
CREATE TABLE IF NOT EXISTS freelancer_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint on name combination (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_freelancer_identity_name 
ON freelancer_identities(LOWER(first_name), LOWER(last_name));

-- Enable RLS on freelancer_identities
ALTER TABLE freelancer_identities ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert for freelancer identities (needed for link-based access)
CREATE POLICY "Anyone can read freelancer identities" 
ON freelancer_identities FOR SELECT USING (true);

CREATE POLICY "Anyone can insert freelancer identities" 
ON freelancer_identities FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update freelancer identities" 
ON freelancer_identities FOR UPDATE USING (true);

-- Add freelancer_identity_id to review_comments for attribution
ALTER TABLE review_comments 
ADD COLUMN IF NOT EXISTS freelancer_identity_id UUID REFERENCES freelancer_identities(id);

-- Add freelancer_identity_id to job_submissions for attribution
ALTER TABLE job_submissions 
ADD COLUMN IF NOT EXISTS freelancer_identity_id UUID REFERENCES freelancer_identities(id);

-- Add freelancer_identity_id to job_outputs for attribution
ALTER TABLE job_outputs 
ADD COLUMN IF NOT EXISTS freelancer_identity_id UUID REFERENCES freelancer_identities(id);

-- Add freelancer_identity_id to submission_assets for attribution
ALTER TABLE submission_assets 
ADD COLUMN IF NOT EXISTS freelancer_identity_id UUID REFERENCES freelancer_identities(id);

-- RLS policy: Allow public read of jobs with valid access token
CREATE POLICY "public_read_job_with_token" ON unified_jobs
FOR SELECT USING (access_token IS NOT NULL OR public.is_internal_user(auth.uid()));

-- RLS policy: Allow public read of job inputs for token-accessible jobs
CREATE POLICY "public_read_inputs_for_token_jobs" ON job_inputs
FOR SELECT USING (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public insert of outputs for token-accessible jobs
CREATE POLICY "public_insert_outputs_for_token_jobs" ON job_outputs
FOR INSERT WITH CHECK (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of outputs for token-accessible jobs
CREATE POLICY "public_read_outputs_for_token_jobs" ON job_outputs
FOR SELECT USING (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of job notes for token-accessible jobs
CREATE POLICY "public_read_notes_for_token_jobs" ON job_notes
FOR SELECT USING (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public insert of job notes for token-accessible jobs
CREATE POLICY "public_insert_notes_for_token_jobs" ON job_notes
FOR INSERT WITH CHECK (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of submissions for token-accessible jobs
CREATE POLICY "public_read_submissions_for_token_jobs" ON job_submissions
FOR SELECT USING (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public insert of submissions for token-accessible jobs
CREATE POLICY "public_insert_submissions_for_token_jobs" ON job_submissions
FOR INSERT WITH CHECK (
  job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL)
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of submission assets for token-accessible jobs
CREATE POLICY "public_read_submission_assets_for_token_jobs" ON submission_assets
FOR SELECT USING (
  submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  )
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public insert of submission assets for token-accessible jobs
CREATE POLICY "public_insert_submission_assets_for_token_jobs" ON submission_assets
FOR INSERT WITH CHECK (
  submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  )
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of review threads for token-accessible jobs
CREATE POLICY "public_read_threads_for_token_jobs" ON review_threads
FOR SELECT USING (
  submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  )
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public read of review comments for token-accessible jobs
CREATE POLICY "public_read_comments_for_token_jobs" ON review_comments
FOR SELECT USING (
  thread_id IN (
    SELECT rt.id FROM review_threads rt
    JOIN job_submissions js ON rt.submission_id = js.id
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  )
  OR public.is_internal_user(auth.uid())
);

-- RLS policy: Allow public insert of review comments for token-accessible jobs
CREATE POLICY "public_insert_comments_for_token_jobs" ON review_comments
FOR INSERT WITH CHECK (
  thread_id IN (
    SELECT rt.id FROM review_threads rt
    JOIN job_submissions js ON rt.submission_id = js.id
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  )
  OR public.is_internal_user(auth.uid())
);