export interface ReposeBatch {
  id: string;
  job_id: string;
  brand_id: string | null;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  config_json: ReposeConfig;
  created_at: string;
  updated_at: string;
}

export interface ReposeConfig {
  randomPosesPerSlot?: number;
  attemptsPerPose?: number;
  pairingRules?: PairingRules;
  seed?: number;
}

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
  slot: string | null;
  attempt_index: number;
  result_url: string | null;
  status: 'queued' | 'running' | 'complete' | 'failed';
  created_at: string;
}

export const DEFAULT_PAIRING_RULES: PairingRules = {
  frontToSlotA: true,
  frontToSlotB: true,
  backToSlotC: true,
  detailToSlotD: true,
  sideToSlotB: false,
};

export const DEFAULT_REPOSE_CONFIG: ReposeConfig = {
  randomPosesPerSlot: 2,
  attemptsPerPose: 1,
  pairingRules: DEFAULT_PAIRING_RULES,
};
