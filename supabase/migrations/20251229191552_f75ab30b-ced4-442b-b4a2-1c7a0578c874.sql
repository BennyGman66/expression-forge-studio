-- Create client_reviews table
CREATE TABLE public.client_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  generation_job_id UUID REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create client_review_items table
CREATE TABLE public.client_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES public.client_reviews(id) ON DELETE CASCADE NOT NULL,
  generation_id UUID REFERENCES public.generations(id) ON DELETE CASCADE NOT NULL,
  look_id UUID REFERENCES public.talent_looks(id) ON DELETE SET NULL,
  slot TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create client_review_feedback table
CREATE TABLE public.client_review_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES public.client_reviews(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.client_review_items(id) ON DELETE CASCADE,
  look_id UUID REFERENCES public.talent_looks(id) ON DELETE SET NULL,
  is_favorite BOOLEAN DEFAULT false,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.client_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_review_feedback ENABLE ROW LEVEL SECURITY;

-- Public access policies (password protection at app level)
CREATE POLICY "Public access to client_reviews"
ON public.client_reviews FOR ALL
USING (true) WITH CHECK (true);

CREATE POLICY "Public access to client_review_items"
ON public.client_review_items FOR ALL
USING (true) WITH CHECK (true);

CREATE POLICY "Public access to client_review_feedback"
ON public.client_review_feedback FOR ALL
USING (true) WITH CHECK (true);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_client_reviews_updated_at
  BEFORE UPDATE ON public.client_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_review_feedback_updated_at
  BEFORE UPDATE ON public.client_review_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for feedback table
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_review_feedback;