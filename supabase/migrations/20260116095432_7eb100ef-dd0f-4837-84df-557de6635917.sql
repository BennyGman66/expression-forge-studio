-- Update job_submissions INSERT policy to support freelancer identity
DROP POLICY IF EXISTS "public_insert_submissions_for_token_jobs" ON public.job_submissions;

CREATE POLICY "public_insert_submissions_for_freelancer_jobs" ON public.job_submissions
FOR INSERT TO public
WITH CHECK (
  -- Allow if job has access_token (legacy)
  (job_id IN (SELECT id FROM unified_jobs WHERE access_token IS NOT NULL))
  OR
  -- Allow if job has freelancer_identity_id and the submission includes freelancer_identity_id
  (job_id IN (
    SELECT id FROM unified_jobs 
    WHERE freelancer_identity_id IS NOT NULL
  ) AND freelancer_identity_id IS NOT NULL)
  OR
  is_internal_user(auth.uid())
);

-- Update submission_assets INSERT policy
DROP POLICY IF EXISTS "public_insert_submission_assets_for_token_jobs" ON public.submission_assets;

CREATE POLICY "public_insert_submission_assets_for_freelancer_jobs" ON public.submission_assets
FOR INSERT TO public
WITH CHECK (
  -- Allow if the submission's job has access_token (legacy)
  (submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.access_token IS NOT NULL
  ))
  OR
  -- Allow if the submission's job has freelancer_identity_id
  (submission_id IN (
    SELECT js.id FROM job_submissions js
    JOIN unified_jobs uj ON js.job_id = uj.id
    WHERE uj.freelancer_identity_id IS NOT NULL
  ) AND freelancer_identity_id IS NOT NULL)
  OR
  is_internal_user(auth.uid())
);