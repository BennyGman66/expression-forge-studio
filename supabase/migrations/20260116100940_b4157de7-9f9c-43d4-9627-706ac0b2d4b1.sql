-- Fix unified_artifacts RLS policy to allow viewing artifacts for OPEN jobs
-- Currently freelancers cannot see images when previewing OPEN jobs because
-- the policy only allows access when freelancer_identity_id IS NOT NULL

DROP POLICY IF EXISTS "Public can view artifacts for freelancer jobs" ON public.unified_artifacts;

CREATE POLICY "Public can view artifacts for freelancer or open jobs" ON public.unified_artifacts
FOR SELECT TO public
USING (
  -- Allow if artifact is linked to job_inputs for an OPEN or freelancer-assigned job
  (EXISTS (
    SELECT 1
    FROM job_inputs ji
    JOIN unified_jobs uj ON ji.job_id = uj.id
    WHERE ji.artifact_id = unified_artifacts.id
    AND (
      uj.freelancer_identity_id IS NOT NULL
      OR uj.status = 'OPEN'
      OR uj.access_token IS NOT NULL
    )
  ))
  OR
  -- Allow if artifact is linked to job_outputs for a freelancer-assigned job
  (EXISTS (
    SELECT 1
    FROM job_outputs jo
    JOIN unified_jobs uj ON jo.job_id = uj.id
    WHERE jo.artifact_id = unified_artifacts.id
    AND (
      uj.freelancer_identity_id IS NOT NULL
      OR uj.status = 'OPEN'
      OR uj.access_token IS NOT NULL
    )
  ))
  OR
  -- Internal users always have access
  is_internal_user(auth.uid())
);