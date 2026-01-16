import type { OutputShotType } from './shot-types';

export type LookStatus = 'approved' | 'submitted' | 'in_progress' | 'open' | 'not_ready';

export interface LookReadiness {
  frontFull: boolean;
  frontCropped: boolean;
  detail: boolean;
  backFull: boolean;
}

export interface LookWithStats {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
  status: LookStatus;
  readiness: LookReadiness;
  productType: 'top' | 'trousers' | null;
  renderedRuns: number;
  lastRun?: {
    status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
    completedAt: string | null;
    outputCount: number;
  };
  views: Array<{
    view: string;
    sourceUrl: string;
    hasSource: boolean;
  }>;
}

export type LooksFilter = 'all' | 'approved' | 'not_ready' | 'rendered' | 'not_rendered' | 'needs_action';

export interface BatchSetupConfig {
  brandId: string | null;
  posesPerShotType: number;
  attemptsPerPose: number;
  model: string;
  runsPerLook: number;
}
