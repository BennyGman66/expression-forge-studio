import type { LookViewState, TabName, FilterMode } from '@/types/workflow-state';

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
