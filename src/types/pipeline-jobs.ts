export type PipelineJobType =
  | 'SCRAPE_BRAND'
  | 'SCRAPE_FACES'
  | 'FACE_SCRAPE'
  | 'CLAY_GENERATION'
  | 'POSE_GENERATION'
  | 'FACE_GENERATION'
  | 'FACE_PAIRING'
  | 'CROP_GENERATION'
  | 'ORGANIZE_IMAGES'
  | 'OTHER';

export type PipelineJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface PipelineJob {
  id: string;
  type: PipelineJobType;
  title: string;
  status: PipelineJobStatus;
  progress_total: number;
  progress_done: number;
  progress_failed: number;
  progress_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  origin_route: string;
  origin_context: Record<string, unknown>;
  supports_pause: boolean;
  supports_retry: boolean;
  supports_restart: boolean;
  source_table: string | null;
  source_job_id: string | null;
}

export interface PipelineJobEvent {
  id: string;
  job_id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, unknown>;
}

export interface CreateJobParams {
  type: PipelineJobType;
  title: string;
  total: number;
  origin_route: string;
  origin_context?: Record<string, unknown>;
  supports_pause?: boolean;
  supports_retry?: boolean;
  supports_restart?: boolean;
  source_table?: string;
  source_job_id?: string;
}

export interface UpdateProgressParams {
  done?: number;
  doneDelta?: number;
  failed?: number;
  failedDelta?: number;
  message?: string;
}

export const JOB_TYPE_CONFIG: Record<PipelineJobType, { label: string; color: string }> = {
  SCRAPE_BRAND: { label: 'Scrape', color: 'bg-blue-500' },
  SCRAPE_FACES: { label: 'Faces', color: 'bg-cyan-500' },
  FACE_SCRAPE: { label: 'Face Scrape', color: 'bg-teal-500' },
  CLAY_GENERATION: { label: 'Clay', color: 'bg-amber-500' },
  POSE_GENERATION: { label: 'Pose', color: 'bg-purple-500' },
  FACE_GENERATION: { label: 'Face', color: 'bg-pink-500' },
  FACE_PAIRING: { label: 'Pairing', color: 'bg-rose-500' },
  CROP_GENERATION: { label: 'Crop', color: 'bg-green-500' },
  ORGANIZE_IMAGES: { label: 'Organize', color: 'bg-indigo-500' },
  OTHER: { label: 'Other', color: 'bg-gray-500' },
};

export const JOB_STATUS_CONFIG: Record<PipelineJobStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  QUEUED: { label: 'Queued', variant: 'secondary' },
  RUNNING: { label: 'Running', variant: 'default' },
  PAUSED: { label: 'Paused', variant: 'outline' },
  COMPLETED: { label: 'Complete', variant: 'secondary' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  CANCELED: { label: 'Canceled', variant: 'outline' },
};
