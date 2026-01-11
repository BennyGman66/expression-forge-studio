// Utility functions for workflow state management

import type { TabName, ViewStateStatus, LookViewState, LookWorkflowSummary, TabSummary, WORKFLOW_VIEWS } from '@/types/workflow-state';

export interface LookData {
  id: string;
  name: string;
  sourceImages?: Array<{
    view: string;
    source_url: string;
    head_cropped_url: string | null;
  }>;
  outputs?: Array<{
    view: string;
    status: string;
    is_selected: boolean;
  }>;
  aiApplyOutputs?: Array<{
    view: string;
    status: string;
    is_selected: boolean;
  }>;
}

/**
 * Infer view state based on existing data for a specific tab
 */
export function inferViewState(
  tab: TabName,
  look: LookData,
  view: string
): ViewStateStatus {
  const sourceImage = look.sourceImages?.find(img => img.view === view);
  
  switch (tab) {
    case 'upload':
      // Completed if source image exists
      return sourceImage?.source_url ? 'completed' : 'not_started';
      
    case 'crop':
      // Completed if head crop exists
      return sourceImage?.head_cropped_url ? 'completed' : 'not_started';
      
    case 'match':
      // Match completion is tracked separately - check if has face foundation match
      // For now, infer from whether there are outputs
      return sourceImage?.head_cropped_url ? 'completed' : 'not_started';
      
    case 'generate':
      // Check if outputs exist for this view
      const generateOutputs = look.outputs?.filter(o => o.view === view);
      if (!generateOutputs?.length) return 'not_started';
      if (generateOutputs.some(o => o.status === 'generating')) return 'in_progress';
      if (generateOutputs.some(o => o.status === 'failed')) return 'failed';
      if (generateOutputs.some(o => o.status === 'completed')) return 'completed';
      return 'in_progress';
      
    case 'review':
      // Completed if an output is selected
      const selectedOutput = look.outputs?.find(o => o.view === view && o.is_selected);
      return selectedOutput ? 'completed' : 'not_started';
      
    case 'ai_apply':
      // Check AI apply outputs
      const aiOutputs = look.aiApplyOutputs?.filter(o => o.view === view);
      if (!aiOutputs?.length) return 'not_started';
      if (aiOutputs.some(o => o.status === 'generating')) return 'in_progress';
      if (aiOutputs.some(o => o.status === 'failed')) return 'failed';
      if (aiOutputs.some(o => o.is_selected)) return 'completed';
      if (aiOutputs.some(o => o.status === 'completed')) return 'completed';
      return 'in_progress';
      
    case 'handoff':
      // Handoff is complete once signed off and sent
      return 'not_started';
      
    default:
      return 'not_started';
  }
}

/**
 * Calculate summary for a single tab across all views
 */
export function calculateTabSummary(
  states: LookViewState[],
  tab: TabName,
  views: readonly string[]
): TabSummary {
  const tabStates = states.filter(s => s.tab === tab);
  const totalViews = views.length;
  
  const completedViews = tabStates.filter(s => 
    s.status === 'completed' || s.status === 'signed_off'
  ).length;
  
  const needsAction = totalViews - completedViews;
  
  let status: TabSummary['status'] = 'not_started';
  if (completedViews === totalViews && tabStates.some(s => s.status === 'signed_off')) {
    status = 'signed_off';
  } else if (completedViews === totalViews) {
    status = 'complete';
  } else if (completedViews > 0) {
    status = 'partial';
  }
  
  return {
    totalViews,
    completedViews,
    needsAction,
    status,
  };
}

/**
 * Build workflow summary for a look
 */
export function buildLookWorkflowSummary(
  lookId: string,
  lookName: string,
  states: LookViewState[],
  views: readonly string[],
  tabs: readonly TabName[]
): LookWorkflowSummary {
  const byTab = {} as Record<TabName, TabSummary>;
  
  for (const tab of tabs) {
    byTab[tab] = calculateTabSummary(states, tab, views);
  }
  
  // Calculate overall progress (average across all tabs)
  const totalPossible = tabs.length * views.length;
  const totalCompleted = Object.values(byTab).reduce(
    (sum, ts) => sum + ts.completedViews, 0
  );
  const overallProgress = totalPossible > 0 
    ? Math.round((totalCompleted / totalPossible) * 100) 
    : 0;
  
  // Check if fully signed off
  const isFullySigned = Object.values(byTab).every(ts => ts.status === 'signed_off');
  
  return {
    lookId,
    lookName,
    byTab,
    overallProgress,
    isFullySigned,
  };
}

/**
 * Determine if a view needs action for a specific tab
 */
export function viewNeedsAction(status: ViewStateStatus): boolean {
  return status === 'not_started' || status === 'in_progress' || status === 'failed';
}

/**
 * Get downstream tabs that should be reset when an earlier tab is modified
 */
export function getDownstreamTabs(tab: TabName): TabName[] {
  const order: TabName[] = ['upload', 'crop', 'match', 'generate', 'review', 'ai_apply', 'handoff'];
  const index = order.indexOf(tab);
  return order.slice(index + 1);
}

/**
 * Check if a tab is considered a "gate" (requires sign-off)
 */
export function isGateTab(tab: TabName): boolean {
  return tab === 'review';
}
