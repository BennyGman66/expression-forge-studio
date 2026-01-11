import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { 
  TabName, 
  ViewStateStatus, 
  LookViewState, 
  LookWorkflowSummary,
  FilterMode,
  WorkflowStateContextValue 
} from '@/types/workflow-state';
import { TAB_NAMES, WORKFLOW_VIEWS } from '@/types/workflow-state';
import { buildLookWorkflowSummary, viewNeedsAction, getDownstreamTabs } from '@/lib/workflowStateUtils';

interface UseWorkflowStateProps {
  projectId: string;
}

export function useWorkflowState({ projectId }: UseWorkflowStateProps): WorkflowStateContextValue {
  const { user } = useAuth();
  const [lookStates, setLookStates] = useState<Map<string, LookViewState[]>>(new Map());
  const [filterMode, setFilterMode] = useState<FilterMode>('needs_action');
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all view states for the project
  const fetchStates = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    try {
      // First get all looks for this project
      const { data: looks, error: looksError } = await supabase
        .from('talent_looks')
        .select('id')
        .eq('project_id', projectId);
      
      if (looksError) throw looksError;
      
      if (!looks?.length) {
        setLookStates(new Map());
        setIsLoading(false);
        return;
      }
      
      const lookIds = looks.map(l => l.id);
      
      // Fetch all view states for these looks
      const { data: states, error: statesError } = await supabase
        .from('look_view_states')
        .select('*')
        .in('look_id', lookIds);
      
      if (statesError) throw statesError;
      
      // Group by look_id
      const statesMap = new Map<string, LookViewState[]>();
      for (const lookId of lookIds) {
        statesMap.set(lookId, []);
      }
      
      for (const state of (states || [])) {
        const existing = statesMap.get(state.look_id) || [];
        existing.push(state as LookViewState);
        statesMap.set(state.look_id, existing);
      }
      
      setLookStates(statesMap);
    } catch (error) {
      console.error('Error fetching workflow states:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Initial fetch
  useEffect(() => {
    fetchStates();
  }, [fetchStates]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`workflow-states-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'look_view_states',
        },
        () => {
          // Refetch on any change
          fetchStates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchStates]);

  // Build summaries from states
  const lookSummaries = useMemo(() => {
    const summaries = new Map<string, LookWorkflowSummary>();
    
    lookStates.forEach((states, lookId) => {
      // We don't have look names here, will need to be provided by context
      const summary = buildLookWorkflowSummary(
        lookId,
        '', // Name will be filled in by consumer
        states,
        WORKFLOW_VIEWS,
        TAB_NAMES
      );
      summaries.set(lookId, summary);
    });
    
    return summaries;
  }, [lookStates]);

  // Update a view's state
  const updateViewState = useCallback(async (
    lookId: string,
    view: string,
    tab: TabName,
    status: ViewStateStatus,
    source: string = 'user'
  ) => {
    const completedAt = (status === 'completed' || status === 'signed_off') 
      ? new Date().toISOString() 
      : null;
    
    const { error } = await supabase
      .from('look_view_states')
      .upsert({
        look_id: lookId,
        view,
        tab,
        status,
        completed_at: completedAt,
        completed_by: user?.id || null,
        completion_source: source,
      }, {
        onConflict: 'look_id,view,tab',
      });
    
    if (error) {
      console.error('Error updating view state:', error);
      throw error;
    }
    
    // Optimistic update
    setLookStates(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(lookId) || [];
      const stateIndex = existing.findIndex(s => s.view === view && s.tab === tab);
      
      const newState: LookViewState = {
        id: stateIndex >= 0 ? existing[stateIndex].id : crypto.randomUUID(),
        look_id: lookId,
        view,
        tab,
        status,
        completed_at: completedAt,
        completed_by: user?.id || null,
        completion_source: source,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      if (stateIndex >= 0) {
        existing[stateIndex] = newState;
      } else {
        existing.push(newState);
      }
      
      newMap.set(lookId, [...existing]);
      return newMap;
    });
  }, [user?.id]);

  // Sign off a view (mark as signed_off)
  const signOffView = useCallback(async (lookId: string, view: string, tab: TabName) => {
    await updateViewState(lookId, view, tab, 'signed_off', 'user');
  }, [updateViewState]);

  // Sign off entire look (all views in review tab)
  const signOffLook = useCallback(async (lookId: string) => {
    // Sign off all views in review tab
    const promises = WORKFLOW_VIEWS.map(view => 
      signOffView(lookId, view, 'review')
    );
    await Promise.all(promises);
    
    // Update the look's signed_off_at
    await supabase
      .from('talent_looks')
      .update({
        signed_off_at: new Date().toISOString(),
        signed_off_by: user?.id,
      })
      .eq('id', lookId);
  }, [signOffView, user?.id]);

  // Unlock a signed-off view
  const unlockView = useCallback(async (lookId: string, view: string, tab: TabName) => {
    await updateViewState(lookId, view, tab, 'completed', 'user');
    
    // Reset downstream states
    const downstreamTabs = getDownstreamTabs(tab);
    for (const downstreamTab of downstreamTabs) {
      await updateViewState(lookId, view, downstreamTab, 'not_started', 'system');
    }
  }, [updateViewState]);

  // Get filtered looks for a tab
  const getFilteredLooks = useCallback((
    tab: TabName,
    looks: { id: string; name: string }[]
  ): { id: string; name: string; needsAction: boolean }[] => {
    return looks.map(look => {
      const states = lookStates.get(look.id) || [];
      const tabStates = states.filter(s => s.tab === tab);
      
      // Check if any view needs action
      const needsAction = WORKFLOW_VIEWS.some(view => {
        const viewState = tabStates.find(s => s.view === view);
        return !viewState || viewNeedsAction(viewState.status);
      });
      
      return { ...look, needsAction };
    }).filter(look => filterMode === 'all' || look.needsAction);
  }, [lookStates, filterMode]);

  // Get summary for a specific tab
  const getTabSummary = useCallback((tab: TabName): { needsAction: number; total: number; complete: number } => {
    let needsAction = 0;
    let total = 0;
    let complete = 0;
    
    lookStates.forEach((states) => {
      const tabStates = states.filter(s => s.tab === tab);
      
      for (const view of WORKFLOW_VIEWS) {
        total++;
        const viewState = tabStates.find(s => s.view === view);
        
        if (!viewState || viewNeedsAction(viewState.status)) {
          needsAction++;
        } else if (viewState.status === 'completed' || viewState.status === 'signed_off') {
          complete++;
        }
      }
    });
    
    return { needsAction, total, complete };
  }, [lookStates]);

  return {
    lookStates,
    lookSummaries,
    filterMode,
    setFilterMode,
    updateViewState,
    signOffView,
    signOffLook,
    unlockView,
    getFilteredLooks,
    getTabSummary,
    refetch: fetchStates,
    isLoading,
  };
}
