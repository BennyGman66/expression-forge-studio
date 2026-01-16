-- Create repose_runs table to track individual generation runs per look
CREATE TABLE public.repose_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.repose_batches(id) ON DELETE CASCADE,
  look_id uuid REFERENCES public.talent_looks(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  run_index integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed', 'cancelled')),
  config_snapshot jsonb,
  error_message text,
  output_count integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz DEFAULT now(),
  
  UNIQUE(batch_id, look_id, run_index)
);

-- Add indexes for common queries
CREATE INDEX idx_repose_runs_batch_id ON public.repose_runs(batch_id);
CREATE INDEX idx_repose_runs_look_id ON public.repose_runs(look_id);
CREATE INDEX idx_repose_runs_status ON public.repose_runs(status);
CREATE INDEX idx_repose_runs_brand_id ON public.repose_runs(brand_id);

-- Add run_id column to repose_outputs to link outputs to specific runs
ALTER TABLE public.repose_outputs ADD COLUMN run_id uuid REFERENCES public.repose_runs(id) ON DELETE SET NULL;
CREATE INDEX idx_repose_outputs_run_id ON public.repose_outputs(run_id);

-- Enable RLS
ALTER TABLE public.repose_runs ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for repose_runs (same pattern as repose_batches)
CREATE POLICY "Allow all access to repose_runs" 
ON public.repose_runs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.repose_runs;

-- Create trigger for updated_at
CREATE TRIGGER update_repose_runs_updated_at
BEFORE UPDATE ON public.repose_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();