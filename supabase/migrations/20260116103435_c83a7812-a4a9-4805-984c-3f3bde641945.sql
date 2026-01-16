-- Drop the existing policy
DROP POLICY IF EXISTS "public_update_in_progress_jobs" ON public.unified_jobs;

-- Create updated policy with proper USING and WITH CHECK clauses
CREATE POLICY "public_update_in_progress_jobs"
ON public.unified_jobs FOR UPDATE
TO public
USING (
  -- Can update if job has freelancer and is IN_PROGRESS or NEEDS_CHANGES
  freelancer_identity_id IS NOT NULL 
  AND status IN ('IN_PROGRESS', 'NEEDS_CHANGES')
)
WITH CHECK (
  -- Allow transitioning to SUBMITTED status (in addition to staying IN_PROGRESS/NEEDS_CHANGES)
  freelancer_identity_id IS NOT NULL 
  AND status IN ('IN_PROGRESS', 'NEEDS_CHANGES', 'SUBMITTED')
);