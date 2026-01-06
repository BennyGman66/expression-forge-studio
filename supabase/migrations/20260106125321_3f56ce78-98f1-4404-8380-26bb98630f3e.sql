-- Add new job types to the pipeline_job_type enum
ALTER TYPE pipeline_job_type ADD VALUE IF NOT EXISTS 'ORGANIZE_FACES';
ALTER TYPE pipeline_job_type ADD VALUE IF NOT EXISTS 'CLASSIFY_FACES';