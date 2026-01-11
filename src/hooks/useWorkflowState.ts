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
import { TAB_NAMES } from '@/types/workflow-state';
import { buildLookWorkflowSummary, viewNeedsAction, getDownstreamTabs, inferViewState, LookData } from '@/lib/workflowStateUtils';

interface UseWorkflowStateProps {
  projectId: string;
}

export function useWorkflowState({ projectId }: UseWorkflowStateProps): WorkflowStateContextValue {
  const { user } = useAuth();
  const [lookStates, setLookStates] = useState<Map<string, LookViewState[]>>(new Map());
  const [filterMode, setFilterMode] = useState<FilterMode>('needs_action');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [detectedViews, setDetectedViews] = useState<string[]>([]);

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
      
      // Collect detected views
      const viewsSet = new Set<string>();
      
      for (const state of (states || [])) {
        const existing = statesMap.get(state.look_id) || [];
        existing.push(state as LookViewState);
        statesMap.set(state.look_id, existing);
        viewsSet.add(state.view);
      }
      
      setDetectedViews(Array.from(viewsSet));
      setLookStates(statesMap);
    } catch (error) {
      console.error('Error fetching workflow states:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Sync states from existing data (infer states from look_source_images, outputs, etc.)
  const syncStatesFromData = useCallback(async () => {
    if (!projectId) return;
    
    setIsSyncing(true);
    try {
      // Fetch looks first
      const { data: looks, error: looksError } = await supabase
        .from('talent_looks')
        .select('id, name')
        .eq('project_id', projectId);
      
      if (looksError) throw looksError;
      if (!looks?.length) {
        setIsSyncing(false);
        return;
      }

      const lookIds = looks.map(l => l.id);

      // Fetch source images for all looks
      const { data: sourceImages } = await supabase
        .from('look_source_images')
        .select('id, look_id, view, source_url, head_cropped_url, digital_talent_id')
        .in('look_id', lookIds);

      // Map source images by look_id
      const sourceImagesByLook: Record<string, any[]> = {};
      for (const img of (sourceImages || [])) {
        if (!sourceImagesByLook[img.look_id]) {
          sourceImagesByLook[img.look_id] = [];
        }
        sourceImagesByLook[img.look_id].push(img);
      }

      // Get all face_application_jobs for this project
      const { data: jobs } = await supabase
        .from('face_application_jobs')
        .select('id, look_id')
        .eq('project_id', projectId);

      // Get all outputs for these jobs
      let allOutputs: any[] = [];
      if (jobs?.length) {
        const jobIds = jobs.map(j => j.id);
        const { data: outputs } = await supabase
          .from('face_application_outputs')
          .select('*')
          .in('job_id', jobIds);
        allOutputs = outputs || [];
      }

      // Get all AI apply outputs for this project
      const { data: aiJobs } = await supabase
        .from('ai_apply_jobs')
        .select('id, look_id')
        .eq('project_id', projectId);

      let allAiOutputs: any[] = [];
      if (aiJobs?.length) {
        const aiJobIds = aiJobs.map(j => j.id);
        const { data: aiOutputs } = await supabase
          .from('ai_apply_outputs')
          .select('*')
          .in('job_id', aiJobIds);
        allAiOutputs = aiOutputs || [];
      }

      // Map outputs by look_id
      const outputsByLook: Record<string, any[]> = {};
      for (const job of (jobs || [])) {
        outputsByLook[job.look_id] = allOutputs.filter(o => {
          const matchingJob = jobs?.find(j => j.id === o.job_id);
          return matchingJob?.look_id === job.look_id;
        });
      }

      const aiOutputsByLook: Record<string, any[]> = {};
      for (const job of (aiJobs || [])) {
        aiOutputsByLook[job.look_id] = allAiOutputs.filter(o => {
          const matchingJob = aiJobs?.find(j => j.id === o.job_id);
          return matchingJob?.look_id === job.look_id;
        });
      }

      // Build states to upsert
      const statesToUpsert: Array<{
        look_id: string;
        view: string;
        tab: TabName;
        status: ViewStateStatus;
        completion_source: string;
      }> = [];

      for (const look of looks) {
        const lookSourceImages = sourceImagesByLook[look.id] || [];
        const lookData: LookData = {
          id: look.id,
          name: look.name,
          sourceImages: lookSourceImages.map((img: any) => ({
            view: img.view,
            source_url: img.source_url,
            head_cropped_url: img.head_cropped_url,
            digital_talent_id: img.digital_talent_id,
          })),
          outputs: outputsByLook[look.id] || [],
          aiApplyOutputs: aiOutputsByLook[look.id] || [],
        };

        // Get unique views from source images
        const views = [...new Set(lookSourceImages.map((i: any) => i.view))];
        
        for (const view of views) {
          for (const tab of TAB_NAMES) {
            const inferredStatus = inferViewState(tab, lookData, view as string);
            statesToUpsert.push({
              look_id: look.id,
              view: view as string,
              tab,
              status: inferredStatus,
              completion_source: 'system_sync',
            });
          }
        }
      }

      if (statesToUpsert.length > 0) {
        // Upsert with ON CONFLICT - only insert if doesn't exist
        const { error: upsertError } = await supabase
          .from('look_view_states')
          .upsert(statesToUpsert, {
            onConflict: 'look_id,view,tab',
            ignoreDuplicates: true, // Only insert if doesn't exist
          });

        if (upsertError) {
          console.error('Error upserting states:', upsertError);
        }
      }

      // Refetch to get updated states
      await fetchStates();
    } catch (error) {
      console.error('Error syncing workflow states:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, fetchStates]);

  // Initial fetch and sync
  useEffect(() => {
    const init = async () => {
      await fetchStates();
      // After initial fetch, sync from data if we have no states yet
      // This populates initial states from existing data
      await syncStatesFromData();
    };
    init();
  }, [fetchStates, syncStatesFromData]);

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

  // Build summaries from states using detected views
  const lookSummaries = useMemo(() => {
    const summaries = new Map<string, LookWorkflowSummary>();
    const viewsToUse = detectedViews.length > 0 ? detectedViews : ['front', 'back', 'side', 'detail'];
    
    lookStates.forEach((states, lookId) => {
      // We don't have look names here, will need to be provided by context
      const summary = buildLookWorkflowSummary(
        lookId,
        '', // Name will be filled in by consumer
        states,
        viewsToUse,
        TAB_NAMES
      );
      summaries.set(lookId, summary);
    });
    
    return summaries;
  }, [lookStates, detectedViews]);

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
    // Get the views for this look
    const states = lookStates.get(lookId) || [];
    const views = [...new Set(states.map(s => s.view))];
    
    // Sign off all views in review tab
    const promises = views.map(view => 
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
  }, [signOffView, user?.id, lookStates]);

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
      
      // Get views for this look
      const lookViews = [...new Set(states.map(s => s.view))];
      
      // Check if any view needs action
      const needsAction = lookViews.length === 0 || lookViews.some(view => {
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
      const lookViews = [...new Set(states.map(s => s.view))];
      
      for (const view of lookViews) {
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
    isSyncing,
  };
}
