-- Fix freelancer submission RLS policies
-- The current policies only allow SELECT when access_token IS NOT NULL
-- But jobs now use freelancer_identity_id, so we need to update these policies

-- Step 1: Update job_submissions SELECT policy
DROP POLICY IF EXISTS "public_read_submissions_for_token_jobs" ON public.job_submissions;

CREATE POLICY "public_read_submissions_for_freelancer_or_token_jobs" ON public.job_submissions
FOR SELECT TO public
USING (
  (job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL))
  OR
  (job_id IN (SELECT id FROM unified_jobs WHERE freelancer_identity_id IS NOT NULL))
  OR
  is_internal_user(auth.uid())
);

-- Step 2: Update submission_assets SELECT policy
DROP POLICY IF EXISTS "public_read_submission_assets_for_token_jobs" ON public.submission_assets;

CREATE POLICY "public_read_submission_assets_for_freelancer_or_token_jobs" ON public.submission_assets
FOR SELECT TO public
USING (
  (submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  ))
  OR
  (submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.freelancer_identity_id IS NOT NULL
  ))
  OR
  is_internal_user(auth.uid())
);