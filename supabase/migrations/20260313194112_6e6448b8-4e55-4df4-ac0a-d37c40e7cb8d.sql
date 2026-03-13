CREATE TABLE public.expression_render_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  digital_model_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  prompt text NOT NULL,
  model_ref_url text NOT NULL,
  ai_model text NOT NULL DEFAULT 'google/gemini-3-pro-image-preview',
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error_message text,
  output_id uuid,
  retry_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_expression_queue_status ON public.expression_render_queue (status, retry_after, created_at);
CREATE INDEX idx_expression_queue_job_id ON public.expression_render_queue (job_id);

ALTER TABLE public.expression_render_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to expression_render_queue"
  ON public.expression_render_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_expression_queue_items(p_batch_size integer DEFAULT 1)
RETURNS SETOF public.expression_render_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.expression_render_queue
  SET status = 'processing',
      started_at = now(),
      attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM public.expression_render_queue
    WHERE status = 'pending'
      AND (retry_after IS NULL OR retry_after <= now())
    ORDER BY created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_stale_expression_queue_items()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.expression_render_queue
  SET status = CASE
    WHEN attempts >= max_attempts THEN 'failed'
    ELSE 'pending'
  END,
  error_message = CASE
    WHEN attempts >= max_attempts THEN 'Max attempts exceeded (stale recovery)'
    ELSE error_message
  END
  WHERE status = 'processing'
    AND started_at < now() - interval '5 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.expression_render_queue;