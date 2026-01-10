// Types for the Send to Job Board handoff stage

export const REQUIRED_VIEWS = ['full_front', 'cropped_front', 'back', 'detail'] as const;
export type RequiredView = typeof REQUIRED_VIEWS[number];

// Minimum views needed to send a look (at least one of these must have a selection)
export const MINIMUM_REQUIRED_VIEWS: RequiredView[] = ['full_front', 'back'];

export const VIEW_LABELS: Record<RequiredView, string> = {
  full_front: 'Full Front',
  cropped_front: 'Cropped Front',
  back: 'Back',
  detail: 'Detail',
};

export interface ViewHandoffStatus {
  view: RequiredView;
  hasSelection: boolean;
  selectedUrl: string | null;
  sourceUrl: string | null;
  outputId: string | null;
  sourceImageId: string | null;
}

export interface LookHandoffStatus {
  id: string;
  name: string;
  views: Record<RequiredView, ViewHandoffStatus>;
  status: 'ready' | 'incomplete' | 'blocking';
  readyCount: number;
  isIncluded: boolean; // For bulk selection
}

export interface JobGroup {
  id: string;
  projectId: string;
  name: string;
  brief: string;
  totalLooks: number;
  createdBy: string | null;
  createdAt: string;
}

export interface HandoffSummary {
  totalLooks: number;
  readyLooks: number;
  incompleteLooks: number;
  blockingLooks: number;
  totalJobs: number;
}

// Default production brief template
export const DEFAULT_BRIEF = `Replace face using provided head renders.
Preserve body, clothing, crop, and background.
Match lighting and realism.

- Full Front: Apply front-facing head render
- Cropped Front: Apply front-facing head render  
- Back: Apply back-of-head render
- Detail: Apply appropriate angle render`;
