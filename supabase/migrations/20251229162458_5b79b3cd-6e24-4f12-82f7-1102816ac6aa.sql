-- Make project_id nullable in jobs table
ALTER TABLE public.jobs ALTER COLUMN project_id DROP NOT NULL;

-- Add brand_id column for clay generation jobs
ALTER TABLE public.jobs ADD COLUMN brand_id uuid REFERENCES public.brands(id);

-- Add index for brand_id
CREATE INDEX idx_jobs_brand_id ON public.jobs(brand_id);