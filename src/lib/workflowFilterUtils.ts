import type { LookViewState, TabName, FilterMode } from '@/types/workflow-state';

// For crop tab, only front and back are required - side/detail are optional
const CROP_REQUIRED_VIEWS = ['front', 'back', 'full_front'];

export function isViewComplete(
  lookStates: Map<string, LookViewState[]>,
  lookId: string,
  view: string,
  tab: TabName
): boolean {
  const states = lookStates.get(lookId) || [];
  const viewState = states.find(s => s.tab === tab && s.view === view);
  return viewState?.status === 'completed' || viewState?.status === 'signed_off';
}

export function lookNeedsActionForTab(
  lookStates: Map<string, LookViewState[]>,
  lookId: string,
  tab: TabName
): boolean {
  const states = lookStates.get(lookId) || [];
  const tabStates = states.filter(s => s.tab === tab);
  const views = [...new Set(states.map(s => s.view))];
  
  if (views.length === 0) return true; // No views = needs action
  
  return views.some(view => {
    const viewState = tabStates.find(s => s.view === view);
    return !viewState || (viewState.status !== 'completed' && viewState.status !== 'signed_off');
  });
}

/**
 * Special logic for crop tab: only front and back views are required.
 * If a look only has one of front/back, only that one needs to be cropped.
 * Side and detail views are optional for crop completion.
 */
export function lookNeedsActionForCropTab(
  lookStates: Map<string, LookViewState[]>,
  lookId: string,
  availableViews: string[] // The actual views this look has source images for
): boolean {
  const states = lookStates.get(lookId) || [];
  const tabStates = states.filter(s => s.tab === 'crop');
  
  // Find which required views (front/back) exist for this look
  const requiredViewsForLook = availableViews.filter(v => 
    CROP_REQUIRED_VIEWS.includes(v) || v === 'front' || v === 'back' || v === 'full_front'
  );
  
  // If no required views exist (only side/detail), consider it complete
  if (requiredViewsForLook.length === 0) {
    return false;
  }
  
  // Check if any required view needs action
  return requiredViewsForLook.some(view => {
    const viewState = tabStates.find(s => s.view === view);
    return !viewState || (viewState.status !== 'completed' && viewState.status !== 'signed_off');
  });
}

export function filterLooksByTab<T extends { id: string }>(
  looks: T[],
  lookStates: Map<string, LookViewState[]>,
  tab: TabName,
  filterMode: FilterMode
): { needsAction: T[]; completed: T[] } {
  const needsAction: T[] = [];
  const completed: T[] = [];
  
  for (const look of looks) {
    if (lookNeedsActionForTab(lookStates, look.id, tab)) {
      needsAction.push(look);
    } else {
      completed.push(look);
    }
  }
  
  return { needsAction, completed };
}

export function getDisplayLooks<T extends { id: string }>(
  looks: T[],
  lookStates: Map<string, LookViewState[]>,
  tab: TabName,
  filterMode: FilterMode
): T[] {
  const { needsAction, completed } = filterLooksByTab(looks, lookStates, tab, filterMode);
  
  if (filterMode === 'needs_action') {
    return needsAction;
  }
  
  // Return all, but with needsAction first
  return [...needsAction, ...completed];
}
