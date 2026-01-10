-- Add freelancer_identity_id column to unified_jobs
ALTER TABLE unified_jobs 
ADD COLUMN freelancer_identity_id uuid REFERENCES freelancer_identities(id);

-- Create index for performance
CREATE INDEX idx_unified_jobs_freelancer_identity ON unified_jobs(freelancer_identity_id);

-- Drop the old token-based policy
DROP POLICY IF EXISTS "public_read_job_with_token" ON unified_jobs;

-- Allow public read of all OPEN jobs that are unassigned
CREATE POLICY "public_read_open_jobs" ON unified_jobs
FOR SELECT
USING (status = 'OPEN' AND assigned_user_id IS NULL);

-- Allow public read of jobs assigned to a freelancer identity (for "My Jobs")
CREATE POLICY "public_read_freelancer_jobs" ON unified_jobs
FOR SELECT
USING (freelancer_identity_id IS NOT NULL);

-- Allow public update for claiming and submitting jobs
CREATE POLICY "public_update_claimable_jobs" ON unified_jobs
FOR UPDATE
USING (status = 'OPEN' AND assigned_user_id IS NULL);

-- Allow public update for in-progress jobs (for submission)
CREATE POLICY "public_update_in_progress_jobs" ON unified_jobs
FOR UPDATE
USING (freelancer_identity_id IS NOT NULL AND status IN ('IN_PROGRESS', 'NEEDS_CHANGES'));

-- Allow public insert for job_outputs
DROP POLICY IF EXISTS "public_insert_job_outputs" ON job_outputs;
CREATE POLICY "public_insert_job_outputs" ON job_outputs
FOR INSERT
WITH CHECK (true);

-- Allow public read for job_outputs
DROP POLICY IF EXISTS "public_read_job_outputs" ON job_outputs;
CREATE POLICY "public_read_job_outputs" ON job_outputs
FOR SELECT
USING (true);

-- Allow public read for job_inputs
DROP POLICY IF EXISTS "public_read_job_inputs" ON job_inputs;
CREATE POLICY "public_read_job_inputs" ON job_inputs
FOR SELECT
USING (true);

-- Allow public insert for job_notes
DROP POLICY IF EXISTS "public_insert_job_notes" ON job_notes;
CREATE POLICY "public_insert_job_notes" ON job_notes
FOR INSERT
WITH CHECK (true);

-- Allow public read for job_notes
DROP POLICY IF EXISTS "public_read_job_notes" ON job_notes;
CREATE POLICY "public_read_job_notes" ON job_notes
FOR SELECT
USING (true);