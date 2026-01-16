// Types for the new repose runs queue system

export type ReposeRunStatus = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'stalled';

export interface ReposeRun {
  id: string;
  batch_id: string;
  look_id: string | null;
  brand_id: string | null;
  run_index: number;
  status: ReposeRunStatus;
  config_snapshot: {
    model?: string;
    posesPerShotType?: number;
    attemptsPerPose?: number;
    brand_id?: string;
  } | null;
  error_message: string | null;
  output_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  heartbeat_at: string | null;
}

export interface LookRunSummary {
  look_id: string;
  look_name: string;
  product_type: 'top' | 'trousers' | null;
  completed_runs: number;
  last_run_status: ReposeRunStatus | null;
  last_run_at: string | null;
  current_run_status: ReposeRunStatus | null;
}

// Queue concurrency
export const REPOSE_QUEUE_CONCURRENCY = 3;

// Stall detection threshold (5 minutes)
export const STALL_THRESHOLD_MS = 5 * 60 * 1000;
