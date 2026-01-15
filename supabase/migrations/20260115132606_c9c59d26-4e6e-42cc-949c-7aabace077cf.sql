-- Drop the policy that doesn't work for freelancer jobs
DROP POLICY IF EXISTS "Freelancers can view artifacts for assigned jobs" ON public.unified_artifacts;

-- Create a policy allowing public read for artifacts on freelancer jobs
-- This matches job_inputs/job_outputs which have public_read policies
CREATE POLICY "Public can view artifacts for freelancer jobs"
ON public.unified_artifacts
FOR SELECT
USING (
  -- Artifacts linked to job_inputs for freelancer jobs
  EXISTS (
    SELECT 1 FROM job_inputs ji
    JOIN unified_jobs uj ON ji.job_id = uj.id
    WHERE ji.artifact_id = unified_artifacts.id
    AND uj.freelancer_identity_id IS NOT NULL
  )
  OR
  -- Artifacts linked to job_outputs for freelancer jobs  
  EXISTS (
    SELECT 1 FROM job_outputs jo
    JOIN unified_jobs uj ON jo.job_id = uj.id
    WHERE jo.artifact_id = unified_artifacts.id
    AND uj.freelancer_identity_id IS NOT NULL
  )
  OR
  -- Internal users retain full access
  is_internal_user(auth.uid())
);