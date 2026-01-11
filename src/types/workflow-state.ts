// Workflow state types for the Face Application pipeline

export const TAB_NAMES = ['upload', 'crop', 'match', 'generate', 'review', 'ai_apply', 'handoff'] as const;
export type TabName = typeof TAB_NAMES[number];

export const VIEW_STATE_STATUSES = ['not_started', 'in_progress', 'completed', 'signed_off', 'failed'] as const;
export type ViewStateStatus = typeof VIEW_STATE_STATUSES[number];

export type FilterMode = 'needs_action' | 'all';

export interface LookViewState {
  id: string;
  look_id: string;
  view: string;
  tab: TabName;
  status: ViewStateStatus;
  completed_at: string | null;
  completed_by: string | null;
  completion_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface TabSummary {
  totalViews: number;
  completedViews: number;
  needsAction: number;
  status: 'not_started' | 'partial' | 'complete' | 'signed_off';
}

export interface LookWorkflowSummary {
  lookId: string;
  lookName: string;
  byTab: Record<TabName, TabSummary>;
  overallProgress: number; // 0-100
  isFullySigned: boolean;
}

export interface WorkflowStateContextValue {
  lookStates: Map<string, LookViewState[]>;
  lookSummaries: Map<string, LookWorkflowSummary>;
  filterMode: FilterMode;
  setFilterMode: (mode: FilterMode) => void;
  updateViewState: (lookId: string, view: string, tab: TabName, status: ViewStateStatus, source?: string) => Promise<void>;
  signOffView: (lookId: string, view: string, tab: TabName) => Promise<void>;
  signOffLook: (lookId: string) => Promise<void>;
  unlockView: (lookId: string, view: string, tab: TabName) => Promise<void>;
  getFilteredLooks: (tab: TabName, looks: { id: string; name: string }[]) => { id: string; name: string; needsAction: boolean }[];
  getTabSummary: (tab: TabName) => { needsAction: number; total: number; complete: number };
  refetch: () => Promise<void>;
  isLoading: boolean;
  isSyncing: boolean;
}

// View types used in the pipeline - matches actual database values
// The database uses: front, back, side, detail (legacy 3-view)
// AND: full_front, cropped_front, back, detail (new 4-view)
export const WORKFLOW_VIEWS = ['full_front', 'cropped_front', 'front', 'back', 'side', 'detail'] as const;
export type WorkflowView = typeof WORKFLOW_VIEWS[number];

// Tab display labels
export const TAB_LABELS: Record<TabName, string> = {
  upload: 'Looks Upload',
  crop: 'Head Crop',
  match: 'Face Match',
  generate: 'Generate',
  review: 'Review',
  ai_apply: 'AI Apply',
  handoff: 'Send to Job Board',
};

// Status display config
export const STATUS_CONFIG: Record<ViewStateStatus, { label: string; color: string; icon: string }> = {
  not_started: { label: 'Not Started', color: 'text-muted-foreground', icon: 'circle' },
  in_progress: { label: 'In Progress', color: 'text-amber-500', icon: 'loader' },
  completed: { label: 'Completed', color: 'text-emerald-500', icon: 'check' },
  signed_off: { label: 'Signed Off', color: 'text-blue-500', icon: 'lock' },
  failed: { label: 'Failed', color: 'text-destructive', icon: 'alert-triangle' },
};
