// Optimised Workflow Types - Completely isolated from existing types

export const WORKFLOW_STAGES = [
  'LOOKS_UPLOADED',
  'MODEL_PAIRED',
  'HEADS_CROPPED',
  'FACE_MATCHED',
  'GENERATED',
  'REVIEW_SELECTED',
  'JOB_BOARD',
  'DONE',
] as const;

export type WorkflowStage = typeof WORKFLOW_STAGES[number];

export const WORKFLOW_VIEWS = ['full_front', 'cropped_front', 'back', 'detail', 'side'] as const;
export type WorkflowView = typeof WORKFLOW_VIEWS[number];

// Stage configuration for UI display
export interface StageConfig {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  requiredAction: string;
}

export const STAGE_CONFIG: Record<WorkflowStage, StageConfig> = {
  LOOKS_UPLOADED: {
    label: 'Looks Uploaded',
    shortLabel: 'Uploaded',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    borderColor: 'border-slate-300',
    description: 'Images uploaded, awaiting model assignment',
    requiredAction: 'Pair with Model',
  },
  MODEL_PAIRED: {
    label: 'Model Paired',
    shortLabel: 'Paired',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
    description: 'Model assigned, awaiting head crops',
    requiredAction: 'Crop Heads',
  },
  HEADS_CROPPED: {
    label: 'Heads Cropped',
    shortLabel: 'Cropped',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    description: 'Heads cropped, awaiting face matching',
    requiredAction: 'Match Faces',
  },
  FACE_MATCHED: {
    label: 'Face Matched',
    shortLabel: 'Matched',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    borderColor: 'border-purple-300',
    description: 'Faces matched, ready for generation',
    requiredAction: 'Generate',
  },
  GENERATED: {
    label: 'Generated',
    shortLabel: 'Generated',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    borderColor: 'border-emerald-300',
    description: 'Images generated, awaiting review',
    requiredAction: 'Review & Select',
  },
  REVIEW_SELECTED: {
    label: 'Review Selected',
    shortLabel: 'Selected',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    borderColor: 'border-teal-300',
    description: 'Selections made, ready to send',
    requiredAction: 'Send to Job Board',
  },
  JOB_BOARD: {
    label: 'Job Board',
    shortLabel: 'Sent',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    borderColor: 'border-indigo-300',
    description: 'Sent to job board, awaiting completion',
    requiredAction: 'Awaiting Freelancer',
  },
  DONE: {
    label: 'Done',
    shortLabel: 'Done',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
    description: 'Workflow complete',
    requiredAction: 'Complete',
  },
};

// Database models
export interface WorkflowProject {
  id: string;
  name: string;
  brand_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowLook {
  id: string;
  project_id: string;
  look_code: string;
  name: string | null;
  stage: WorkflowStage;
  stage_updated_at: string;
  digital_talent_id: string | null;
  generation_run_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowImage {
  id: string;
  look_id: string;
  view: string;
  original_url: string;
  converted_url: string | null;
  file_checksum: string | null;
  filename: string | null;
  head_cropped_url: string | null;
  matched_face_url: string | null;
  matched_foundation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowOutput {
  id: string;
  look_id: string;
  image_id: string | null;
  view: string;
  output_url: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  is_selected: boolean;
  selection_order: number | null;
  generation_run: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowQueueItem {
  id: string;
  project_id: string | null;
  look_id: string | null;
  image_id: string | null;
  view: string | null;
  job_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stalled';
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string;
  created_at: string;
}

// Extended types for UI
export interface WorkflowLookWithDetails extends WorkflowLook {
  images: WorkflowImage[];
  outputs: WorkflowOutput[];
  digital_talent?: {
    id: string;
    name: string;
    thumbnail_url: string | null;
  } | null;
  issues: string[];
  needsAction: boolean;
}

export interface WorkflowProjectWithStats extends WorkflowProject {
  totalLooks: number;
  needsActionCount: number;
  completedCount: number;
  stageBreakdown: Record<WorkflowStage, number>;
}

// Filter and selection types
export type FilterMode = 'needs_action' | 'all';

export interface BulkActionConfig {
  stage: WorkflowStage;
  action: string;
  label: string;
  icon: string;
}

// Upload types
export interface ParsedUploadFile {
  file: File;
  lookCode: string;
  inferredView: WorkflowView | 'unknown';
  filename: string;
  isDuplicate: boolean;
}

export interface UploadSummary {
  totalFiles: number;
  newFiles: number;
  duplicatesSkipped: number;
  looksCreated: number;
  looksUpdated: number;
  byLookCode: Map<string, ParsedUploadFile[]>;
}

// Stage action mapping
export const STAGE_ACTIONS: BulkActionConfig[] = [
  { stage: 'LOOKS_UPLOADED', action: 'pair_model', label: 'Pair with Model', icon: 'User' },
  { stage: 'MODEL_PAIRED', action: 'crop_heads', label: 'Crop Heads', icon: 'Crop' },
  { stage: 'HEADS_CROPPED', action: 'match_faces', label: 'Match Faces', icon: 'ScanFace' },
  { stage: 'FACE_MATCHED', action: 'generate', label: 'Generate', icon: 'Sparkles' },
  { stage: 'GENERATED', action: 'review_select', label: 'Review & Select', icon: 'CheckSquare' },
  { stage: 'REVIEW_SELECTED', action: 'send_to_job_board', label: 'Send to Job Board', icon: 'Send' },
];

// Helper functions
export function getNextStage(currentStage: WorkflowStage): WorkflowStage | null {
  const index = WORKFLOW_STAGES.indexOf(currentStage);
  if (index === -1 || index >= WORKFLOW_STAGES.length - 1) return null;
  return WORKFLOW_STAGES[index + 1];
}

export function getPreviousStage(currentStage: WorkflowStage): WorkflowStage | null {
  const index = WORKFLOW_STAGES.indexOf(currentStage);
  if (index <= 0) return null;
  return WORKFLOW_STAGES[index - 1];
}

export function getStageIndex(stage: WorkflowStage): number {
  return WORKFLOW_STAGES.indexOf(stage);
}

export function isStageComplete(stage: WorkflowStage): boolean {
  return stage === 'DONE';
}

export function canAdvanceStage(look: WorkflowLookWithDetails): boolean {
  switch (look.stage) {
    case 'LOOKS_UPLOADED':
      return !!look.digital_talent_id;
    case 'MODEL_PAIRED':
      return look.images.every(img => !!img.head_cropped_url);
    case 'HEADS_CROPPED':
      return look.images.every(img => !!img.matched_face_url);
    case 'FACE_MATCHED':
      return look.outputs.some(o => o.status === 'completed');
    case 'GENERATED':
      // Require 3 selections per view
      const viewsWithSelections = new Set(
        look.outputs.filter(o => o.is_selected).map(o => o.view)
      );
      return look.images.every(img => viewsWithSelections.has(img.view));
    case 'REVIEW_SELECTED':
      return true; // Can always send to job board
    case 'JOB_BOARD':
      return false; // Externally controlled
    case 'DONE':
      return false;
  }
}
