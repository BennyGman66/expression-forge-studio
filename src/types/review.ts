export type SubmissionStatus = 'SUBMITTED' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED';
export type CommentVisibility = 'SHARED' | 'INTERNAL_ONLY';
export type NotificationType = 'JOB_SUBMITTED' | 'COMMENT_MENTION' | 'CHANGES_REQUESTED' | 'JOB_APPROVED' | 'COMMENT_REPLY';
export type ThreadScope = 'JOB' | 'ASSET' | 'ANNOTATION';

export interface AnnotationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnnotationStyle {
  rounded: boolean;
  color?: string;
}

export interface JobSubmission {
  id: string;
  job_id: string;
  submitted_by_user_id: string | null;
  submitted_at: string;
  status: SubmissionStatus;
  version_number: number;
  summary_note: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  submitted_by?: {
    id: string;
    display_name: string | null;
    email: string;
  };
  assets?: SubmissionAsset[];
}

export interface SubmissionAsset {
  id: string;
  submission_id: string;
  job_output_id: string | null;
  file_url: string | null;
  label: string | null;
  sort_index: number;
  created_at: string;
  // Joined
  annotations?: ImageAnnotation[];
}

export interface ReviewThread {
  id: string;
  submission_id: string;
  scope: ThreadScope;
  asset_id: string | null;
  annotation_id: string | null;
  created_at: string;
  // Joined
  comments?: ReviewComment[];
  unread_count?: number;
}

export interface ReviewComment {
  id: string;
  thread_id: string;
  author_user_id: string | null;
  body: string;
  visibility: CommentVisibility;
  read_by: string[];
  created_at: string;
  // Joined
  author?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}

export interface ImageAnnotation {
  id: string;
  asset_id: string;
  created_by_user_id: string | null;
  shape_type: 'RECT';
  rect: AnnotationRect;
  style: AnnotationStyle;
  created_at: string;
  // Joined
  thread?: ReviewThread;
  created_by?: {
    id: string;
    display_name: string | null;
    email: string;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  job_id: string | null;
  submission_id: string | null;
  comment_id: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}
