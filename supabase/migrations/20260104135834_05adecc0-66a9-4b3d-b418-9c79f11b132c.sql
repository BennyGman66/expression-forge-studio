-- Create submission status enum
CREATE TYPE submission_status AS ENUM ('SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

-- Create visibility enum for comments
CREATE TYPE comment_visibility AS ENUM ('SHARED', 'INTERNAL_ONLY');

-- Create notification type enum
CREATE TYPE notification_type AS ENUM ('JOB_SUBMITTED', 'COMMENT_MENTION', 'CHANGES_REQUESTED', 'JOB_APPROVED', 'COMMENT_REPLY');

-- Create annotation shape type enum
CREATE TYPE annotation_shape AS ENUM ('RECT');

-- 1) job_submissions table
CREATE TABLE public.job_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.unified_jobs(id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES public.users(id),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status submission_status NOT NULL DEFAULT 'SUBMITTED',
  version_number INTEGER NOT NULL DEFAULT 1,
  summary_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for quick lookup
CREATE INDEX idx_job_submissions_job_id ON public.job_submissions(job_id);
CREATE INDEX idx_job_submissions_status ON public.job_submissions(status);

-- 2) submission_assets table
CREATE TABLE public.submission_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  job_output_id UUID REFERENCES public.job_outputs(id) ON DELETE SET NULL,
  file_url TEXT,
  label TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_submission_assets_submission_id ON public.submission_assets(submission_id);

-- 3) review_threads table
CREATE TABLE public.review_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'JOB' CHECK (scope IN ('JOB', 'ASSET', 'ANNOTATION')),
  asset_id UUID REFERENCES public.submission_assets(id) ON DELETE CASCADE,
  annotation_id UUID, -- Will reference image_annotations, added as FK after that table is created
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_threads_submission_id ON public.review_threads(submission_id);
CREATE INDEX idx_review_threads_asset_id ON public.review_threads(asset_id);

-- 4) review_comments table
CREATE TABLE public.review_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.review_threads(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES public.users(id),
  body TEXT NOT NULL,
  visibility comment_visibility NOT NULL DEFAULT 'SHARED',
  read_by JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_comments_thread_id ON public.review_comments(thread_id);
CREATE INDEX idx_review_comments_author ON public.review_comments(author_user_id);

-- 5) image_annotations table
CREATE TABLE public.image_annotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES public.submission_assets(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.users(id),
  shape_type annotation_shape NOT NULL DEFAULT 'RECT',
  rect JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "w": 0.1, "h": 0.1}'::jsonb, -- Normalized 0-1 coords
  style JSONB NOT NULL DEFAULT '{"rounded": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_annotations_asset_id ON public.image_annotations(asset_id);

-- Add FK from review_threads to image_annotations
ALTER TABLE public.review_threads 
ADD CONSTRAINT fk_review_threads_annotation 
FOREIGN KEY (annotation_id) REFERENCES public.image_annotations(id) ON DELETE CASCADE;

-- 6) notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  job_id UUID REFERENCES public.unified_jobs(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES public.job_submissions(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.review_comments(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_job_id ON public.notifications(job_id);

-- Enable RLS on all new tables
ALTER TABLE public.job_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- job_submissions: Internal can manage all, freelancers can view/create their own
CREATE POLICY "Internal users can manage job_submissions"
ON public.job_submissions FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view submissions for assigned jobs"
ON public.job_submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_submissions.job_id 
    AND j.assigned_user_id = auth.uid()
  )
);

CREATE POLICY "Freelancers can create submissions for assigned jobs"
ON public.job_submissions FOR INSERT
WITH CHECK (
  submitted_by_user_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.unified_jobs j 
    WHERE j.id = job_submissions.job_id 
    AND j.assigned_user_id = auth.uid()
  )
);

-- submission_assets: Same pattern
CREATE POLICY "Internal users can manage submission_assets"
ON public.submission_assets FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view submission_assets for their submissions"
ON public.submission_assets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_submissions s
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE s.id = submission_assets.submission_id
    AND j.assigned_user_id = auth.uid()
  )
);

CREATE POLICY "Freelancers can create submission_assets for their submissions"
ON public.submission_assets FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.job_submissions s
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE s.id = submission_assets.submission_id
    AND s.submitted_by_user_id = auth.uid()
  )
);

-- review_threads: Internal full access, freelancers can view threads for their jobs
CREATE POLICY "Internal users can manage review_threads"
ON public.review_threads FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view review_threads for their submissions"
ON public.review_threads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.job_submissions s
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE s.id = review_threads.submission_id
    AND j.assigned_user_id = auth.uid()
  )
);

-- review_comments: Internal full access, freelancers can view SHARED and create
CREATE POLICY "Internal users can manage review_comments"
ON public.review_comments FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view SHARED comments for their submissions"
ON public.review_comments FOR SELECT
USING (
  visibility = 'SHARED' AND
  EXISTS (
    SELECT 1 FROM public.review_threads t
    JOIN public.job_submissions s ON s.id = t.submission_id
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE t.id = review_comments.thread_id
    AND j.assigned_user_id = auth.uid()
  )
);

CREATE POLICY "Freelancers can create comments on their job threads"
ON public.review_comments FOR INSERT
WITH CHECK (
  author_user_id = auth.uid() AND
  visibility = 'SHARED' AND
  EXISTS (
    SELECT 1 FROM public.review_threads t
    JOIN public.job_submissions s ON s.id = t.submission_id
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE t.id = review_comments.thread_id
    AND j.assigned_user_id = auth.uid()
  )
);

-- image_annotations: Internal full access, freelancers can view
CREATE POLICY "Internal users can manage image_annotations"
ON public.image_annotations FOR ALL
USING (is_internal_user(auth.uid()))
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "Freelancers can view annotations for their submissions"
ON public.image_annotations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.submission_assets a
    JOIN public.job_submissions s ON s.id = a.submission_id
    JOIN public.unified_jobs j ON j.id = s.job_id
    WHERE a.id = image_annotations.asset_id
    AND j.assigned_user_id = auth.uid()
  )
);

-- notifications: Users can only see their own
CREATE POLICY "Users can view their own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Internal users can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (is_internal_user(auth.uid()));

CREATE POLICY "System can create notifications for any user"
ON public.notifications FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger to update timestamps
CREATE TRIGGER update_job_submissions_updated_at
BEFORE UPDATE ON public.job_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();