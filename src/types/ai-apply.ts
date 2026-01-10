// AI Apply types for face-to-body application stage

import { ViewType } from './face-application';

export interface AIApplyJob {
  id: string;
  project_id: string;
  look_id: string;
  digital_talent_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
  model: string;
  attempts_per_view: number;
  strictness: 'high' | 'medium' | 'low';
  progress: number;
  total: number;
  pipeline_job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIApplyOutput {
  id: string;
  job_id: string;
  look_id: string;
  view: ViewType | string;
  attempt_index: number;
  head_image_id: string | null;
  head_image_url: string | null;
  body_image_id: string | null;
  body_image_url: string | null;
  prompt_version: string;
  final_prompt: string | null;
  stored_url: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  is_selected: boolean;
  needs_human_fix: boolean;
  error_message: string | null;
  created_at: string;
}

export interface AIApplyPromptTemplate {
  id: string;
  name: string;
  version: string;
  is_active: boolean;
  template: string;
  created_at: string;
}

// Pairing information - what head goes with what body
export interface ViewPairing {
  view: ViewType | string;
  bodyImage: {
    id: string;
    url: string;
    source: 'exact' | 'fallback';
    fallbackFrom?: string; // Which view was used as fallback
  } | null;
  headRender: {
    id: string;
    url: string;
    angleMatch: 'exact' | 'reused' | 'risk';
    originalView?: string; // Which view the head was originally from
  } | null;
  warnings: string[];
  canRun: boolean;
  missingRequirements: string[];
}

// Status for each view in AI Apply
export interface AIApplyViewStatus {
  view: string;
  status: 'not_started' | 'running' | 'completed' | 'failed' | 'needs_selection';
  hasSelection: boolean;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  totalAttempts: number;
  outputs: AIApplyOutput[];
  pairing: ViewPairing | null;
}

// Look with AI Apply statuses
export interface AIApplyLook {
  id: string;
  name: string;
  views: Record<string, AIApplyViewStatus>;
  isReady: boolean; // All views have selections
  isComplete: boolean; // All views have completed generation
  hasWarnings: boolean;
  warnings: string[];
}

// Queue item for AI Apply operations
export interface AIApplyQueueItem {
  id: string;
  lookId: string;
  lookName: string;
  view?: string; // undefined = all views
  type: 'run' | 'add_more' | 'retry_failed';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attemptsRequested: number;
  jobId?: string;
  error?: string;
}

// Default settings (used internally, not exposed in UI)
export const DEFAULT_AI_APPLY_SETTINGS = {
  attemptsPerView: 4,
  strictness: 'high' as const,
  model: 'google/gemini-2.5-flash-image-preview',
};
