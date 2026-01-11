-- Create look_view_states table for tracking per-view, per-tab state
CREATE TABLE public.look_view_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id UUID NOT NULL REFERENCES public.talent_looks(id) ON DELETE CASCADE,
  view TEXT NOT NULL,
  tab TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.users(id),
  completion_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(look_id, view, tab)
);

-- Add workflow columns to talent_looks
ALTER TABLE public.talent_looks 
ADD COLUMN IF NOT EXISTS workflow_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS signed_off_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signed_off_by UUID REFERENCES public.users(id);

-- Enable RLS
ALTER TABLE public.look_view_states ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for look_view_states
CREATE POLICY "Allow read access for authenticated users"
ON public.look_view_states
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow insert for authenticated users"
ON public.look_view_states
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users"
ON public.look_view_states
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Allow delete for authenticated users"
ON public.look_view_states
FOR DELETE
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_look_view_states_updated_at
BEFORE UPDATE ON public.look_view_states
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.look_view_states;

-- Create index for faster lookups
CREATE INDEX idx_look_view_states_look_id ON public.look_view_states(look_id);
CREATE INDEX idx_look_view_states_tab ON public.look_view_states(tab);
CREATE INDEX idx_look_view_states_status ON public.look_view_states(status);