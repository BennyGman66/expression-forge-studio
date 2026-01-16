-- Allow freelancers to delete their own outputs
CREATE POLICY "public_delete_own_job_outputs" ON public.job_outputs
  FOR DELETE
  USING (
    freelancer_identity_id IS NOT NULL 
    AND freelancer_identity_id IN (
      SELECT fi.id FROM freelancer_identities fi
    )
  );