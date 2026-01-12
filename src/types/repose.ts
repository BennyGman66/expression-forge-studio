import type { OutputShotType, CropTarget } from './shot-types';

export interface ReposeBatch {
  id: string;
  job_id: string | null;
  project_id: string | null;
  brand_id: string | null;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  config_json: ReposeConfig;
  created_at: string;
  updated_at: string;
}

export interface ReposeConfig {
  posesPerShotType?: number; // renamed from randomPosesPerSlot
  attemptsPerPose?: number;
  cropTarget?: CropTarget; // for FRONT_CROPPED output
  seed?: number;
  model?: string;
  // DEPRECATED: pairingRules is no longer user-configurable
  // Camera-to-output mapping is now enforced by the system
}

export const REPOSE_MODEL_OPTIONS = [
  { value: 'google/gemini-2.5-flash-image-preview', label: 'Nano Fast' },
  { value: 'google/gemini-3-pro-image-preview', label: 'Pro' },
] as const;

export const DEFAULT_REPOSE_MODEL = 'google/gemini-3-pro-image-preview';

// DEPRECATED: Legacy pairing rules interface - kept for backward compatibility during migration
export interface PairingRules {
  frontToSlotA?: boolean;
  frontToSlotB?: boolean;
  backToSlotC?: boolean;
  detailToSlotD?: boolean;
  sideToSlotB?: boolean;
}

export interface ReposeBatchItem {
  id: string;
  batch_id: string;
  look_id: string | null;
  view: string;
  source_output_id: string | null;
  source_url: string;
  created_at: string;
}

export interface ReposeOutput {
  id: string;
  batch_id: string;
  batch_item_id: string;
  pose_id: string | null;
  slot: string | null; // Legacy field
  shot_type: OutputShotType | null; // New field
  attempt_index: number;
  result_url: string | null;
  status: 'queued' | 'running' | 'complete' | 'failed';
  created_at: string;
}

// DEPRECATED: Legacy pairing rules - kept for backward compatibility
export const DEFAULT_PAIRING_RULES: PairingRules = {
  frontToSlotA: true,
  frontToSlotB: true,
  backToSlotC: true,
  detailToSlotD: true,
  sideToSlotB: false,
};

export const DEFAULT_REPOSE_CONFIG: ReposeConfig = {
  posesPerShotType: 2,
  attemptsPerPose: 1,
  cropTarget: 'top',
};
