-- Add RLS policy allowing freelancers to view artifacts for jobs they are assigned to
CREATE POLICY "Freelancers can view artifacts for assigned jobs"
ON public.unified_artifacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_inputs ji
    JOIN public.unified_jobs uj ON ji.job_id = uj.id
    WHERE ji.artifact_id = unified_artifacts.id
    AND uj.assigned_user_id = auth.uid()
    AND has_role(auth.uid(), 'freelancer')
  )
);