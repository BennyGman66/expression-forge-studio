-- Fix RLS policies so freelancers can see feedback on their jobs
-- Currently policies only check access_token, but jobs use freelancer_identity_id

-- 1. Add policy for image_annotations (currently has NO public read policy)
CREATE POLICY "public_read_annotations_for_freelancer_jobs"
  ON public.image_annotations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM submission_assets a
      JOIN job_submissions s ON s.id = a.submission_id
      JOIN unified_jobs j ON j.id = s.job_id
      WHERE a.id = image_annotations.asset_id
        AND (j.freelancer_identity_id IS NOT NULL OR j.access_token IS NOT NULL)
    )
  );

-- 2. Update review_threads policy to include freelancer_identity_id
DROP POLICY IF EXISTS "public_read_threads_for_token_jobs" ON public.review_threads;

CREATE POLICY "public_read_threads_for_freelancer_or_token_jobs"
  ON public.review_threads FOR SELECT
  USING (
    submission_id IN (
      SELECT js.id
      FROM job_submissions js
      JOIN unified_jobs uj ON js.job_id = uj.id
      WHERE uj.access_token IS NOT NULL 
         OR uj.freelancer_identity_id IS NOT NULL
    )
    OR is_internal_user(auth.uid())
  );

-- 3. Update review_comments policy to include freelancer_identity_id
DROP POLICY IF EXISTS "public_read_comments_for_token_jobs" ON public.review_comments;

CREATE POLICY "public_read_comments_for_freelancer_or_token_jobs"
  ON public.review_comments FOR SELECT
  USING (
    thread_id IN (
      SELECT rt.id
      FROM review_threads rt
      JOIN job_submissions js ON rt.submission_id = js.id
      JOIN unified_jobs uj ON js.job_id = uj.id
      WHERE uj.access_token IS NOT NULL 
         OR uj.freelancer_identity_id IS NOT NULL
    )
    OR is_internal_user(auth.uid())
  );