import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VIEW_LABELS } from "@/types/face-application";

export interface ViewOutputStats {
  view: string;
  viewLabel: string;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  runningCount: number;
  hasAnyOutput: boolean;
  isComplete: boolean; // completedCount >= requiredOptions
}

export interface LookGenerationStats {
  lookId: string;
  lookName: string;
  digitalTalentId: string | null;
  totalViews: number;
  totalCompletedOutputs: number;
  viewsWithOutputs: number;
  viewsComplete: number; // Views meeting the required options
  viewsMissing: number; // Views with 0 outputs
  viewsPartial: number; // Views with some but not enough outputs
  isFullyComplete: boolean;
  needsGeneration: boolean;
  views: ViewOutputStats[];
  sourceImages: Array<{
    id: string;
    view: string;
    head_cropped_url: string | null;
    source_url: string;
    matched_face_url: string | null;
  }>;
  lastGeneratedAt: string | null;
  isNewSinceLastRun: boolean;
}

interface UseGenerationTrackingOptions {
  projectId: string;
  requiredOptions: number;
  selectedLookIds?: Set<string>;
  lastRunTimestamp?: string | null;
}

export function useGenerationTracking({
  projectId,
  requiredOptions,
  selectedLookIds,
  lastRunTimestamp
}: UseGenerationTrackingOptions) {
  const [looks, setLooks] = useState<LookGenerationStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [hasInitialLoad, setHasInitialLoad] = useState(false);
  
  // Use ref to track active generation without causing effect reruns
  const hasActiveGenerationRef = useRef(false);
  const isFetchingRef = useRef(false);

  // Fetch all looks with their source images and output counts
  const fetchData = useCallback(async () => {
    if (!projectId) {
      setLooks([]);
      setIsLoading(false);
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Only show loading spinner on initial load, not refreshes
    if (!hasInitialLoad) {
      setIsLoading(true);
    }

    try {
      // Fetch looks
      const { data: looksData, error: looksError } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id, created_at")
        .eq("project_id", projectId)
        .order("created_at");

      if (looksError) throw looksError;
      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setIsLoading(false);
        return;
      }

      // Filter by selectedLookIds if provided
      const filteredLooks = selectedLookIds && selectedLookIds.size > 0
        ? looksData.filter(l => selectedLookIds.has(l.id))
        : looksData;

      // Fetch source images with crops for all looks
      const { data: sourceImages, error: srcError } = await supabase
        .from("look_source_images")
        .select("id, look_id, view, head_cropped_url, source_url, matched_face_url")
        .in("look_id", filteredLooks.map(l => l.id))
        .not("head_cropped_url", "is", null)
        .order("view");

      if (srcError) throw srcError;

      // Fetch all outputs for these looks
      const { data: outputs, error: outError } = await supabase
        .from("ai_apply_outputs")
        .select("id, look_id, view, status, created_at")
        .in("look_id", filteredLooks.map(l => l.id));

      if (outError) throw outError;

      // Build stats for each look
      const lookStats: LookGenerationStats[] = filteredLooks.map(look => {
        const lookSourceImages = (sourceImages || []).filter(s => s.look_id === look.id);
        const lookOutputs = (outputs || []).filter(o => o.look_id === look.id);

        // Get unique views from source images
        const uniqueViews = [...new Set(lookSourceImages.map(s => s.view))];

        // Calculate per-view stats
        const viewStats: ViewOutputStats[] = uniqueViews.map(view => {
          const viewOutputs = lookOutputs.filter(o => o.view === view);
          const completedCount = viewOutputs.filter(o => o.status === "completed").length;
          const failedCount = viewOutputs.filter(o => o.status === "failed").length;
          const pendingCount = viewOutputs.filter(o => o.status === "pending" || o.status === "queued").length;
          const runningCount = viewOutputs.filter(o => o.status === "generating" || o.status === "running").length;

          return {
            view,
            viewLabel: VIEW_LABELS[view] || view,
            completedCount,
            failedCount,
            pendingCount,
            runningCount,
            hasAnyOutput: completedCount > 0,
            isComplete: completedCount >= requiredOptions,
          };
        });

        // Calculate look-level stats
        const totalCompletedOutputs = viewStats.reduce((sum, v) => sum + v.completedCount, 0);
        const viewsWithOutputs = viewStats.filter(v => v.hasAnyOutput).length;
        const viewsComplete = viewStats.filter(v => v.isComplete).length;
        const viewsMissing = viewStats.filter(v => v.completedCount === 0).length;
        const viewsPartial = viewStats.filter(v => v.hasAnyOutput && !v.isComplete).length;
        const isFullyComplete = viewsComplete === uniqueViews.length && uniqueViews.length > 0;
        const needsGeneration = viewsMissing > 0 || viewsPartial > 0;

        // Find last generated timestamp
        const completedOutputs = lookOutputs.filter(o => o.status === "completed" && o.created_at);
        const lastGeneratedAt = completedOutputs.length > 0
          ? completedOutputs.reduce((latest, o) => 
              !latest || o.created_at > latest ? o.created_at : latest, 
              null as string | null
            )
          : null;

        // Check if new since last run
        const isNewSinceLastRun = lastRunTimestamp
          ? look.created_at > lastRunTimestamp && !lastGeneratedAt
          : !lastGeneratedAt;

        return {
          lookId: look.id,
          lookName: look.name,
          digitalTalentId: look.digital_talent_id,
          totalViews: uniqueViews.length,
          totalCompletedOutputs,
          viewsWithOutputs,
          viewsComplete,
          viewsMissing,
          viewsPartial,
          isFullyComplete,
          needsGeneration,
          views: viewStats,
          sourceImages: lookSourceImages.map(s => ({
            id: s.id,
            view: s.view,
            head_cropped_url: s.head_cropped_url,
            source_url: s.source_url,
            matched_face_url: s.matched_face_url,
          })),
          lastGeneratedAt,
          isNewSinceLastRun,
        };
      });

      // Filter out looks with no source images
      const validLooks = lookStats.filter(l => l.totalViews > 0);
      setLooks(validLooks);

    } catch (error) {
      console.error("Error fetching generation tracking data:", error);
    } finally {
      setIsLoading(false);
      setHasInitialLoad(true);
      isFetchingRef.current = false;
    }
  }, [projectId, selectedLookIds, requiredOptions, lastRunTimestamp, hasInitialLoad]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set up realtime subscription for ai_apply_outputs
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`generation-tracking-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_apply_outputs',
        },
        (payload) => {
          console.log('[Generation Tracking] Realtime update:', payload.eventType);
          // Refresh data when outputs change
          setLastRefresh(Date.now());
        }
      )
      .subscribe((status) => {
        console.log('[Generation Tracking] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Update ref when looks change (doesn't cause effect reruns)
  useEffect(() => {
    hasActiveGenerationRef.current = looks.some(l => 
      l.views.some(v => v.runningCount > 0 || v.pendingCount > 0)
    );
  }, [looks]);

  // Polling fallback - refresh every 5 seconds when there are generating outputs
  // Uses ref instead of looks in dependencies to prevent loop
  useEffect(() => {
    if (!projectId) return;
    
    const interval = setInterval(() => {
      if (hasActiveGenerationRef.current) {
        console.log('[Generation Tracking] Active generation detected, polling...');
        setLastRefresh(Date.now());
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [projectId]); // Only depend on projectId, not looks

  // Refresh when lastRefresh changes (debounced with guard)
  useEffect(() => {
    if (isFetchingRef.current) return;
    
    const timer = setTimeout(() => {
      fetchData();
    }, 500);
    return () => clearTimeout(timer);
  }, [lastRefresh, fetchData]);

  // Computed values
  const summary = useMemo(() => {
    const totalLooks = looks.length;
    const looksComplete = looks.filter(l => l.isFullyComplete).length;
    const looksNeedGeneration = looks.filter(l => l.needsGeneration).length;
    const looksNew = looks.filter(l => l.isNewSinceLastRun).length;
    const totalViews = looks.reduce((sum, l) => sum + l.totalViews, 0);
    const viewsComplete = looks.reduce((sum, l) => sum + l.viewsComplete, 0);
    const totalOutputs = looks.reduce((sum, l) => sum + l.totalCompletedOutputs, 0);

    return {
      totalLooks,
      looksComplete,
      looksNeedGeneration,
      looksNew,
      totalViews,
      viewsComplete,
      totalOutputs,
    };
  }, [looks]);

  // Filter functions
  const getFilteredLooks = useCallback((filter: 'all' | 'needs_generation' | 'new' | 'complete' | 'failed') => {
    switch (filter) {
      case 'needs_generation':
        return looks.filter(l => l.needsGeneration);
      case 'new':
        return looks.filter(l => l.isNewSinceLastRun);
      case 'complete':
        return looks.filter(l => l.isFullyComplete);
      case 'failed':
        return looks.filter(l => l.views.some(v => v.failedCount > 0));
      case 'all':
      default:
        return looks;
    }
  }, [looks]);

  // Get views that need generation (missing or partial)
  const getViewsNeedingGeneration = useCallback((lookId?: string) => {
    const targetLooks = lookId ? looks.filter(l => l.lookId === lookId) : looks;
    const views: Array<{ lookId: string; lookName: string; view: string; missing: number }> = [];

    for (const look of targetLooks) {
      for (const viewStat of look.views) {
        if (!viewStat.isComplete) {
          views.push({
            lookId: look.lookId,
            lookName: look.lookName,
            view: viewStat.view,
            missing: requiredOptions - viewStat.completedCount,
          });
        }
      }
    }

    return views;
  }, [looks, requiredOptions]);

  return {
    looks,
    isLoading,
    summary,
    getFilteredLooks,
    getViewsNeedingGeneration,
    refresh: fetchData,
  };
}
