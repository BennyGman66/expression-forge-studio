import { useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReposeOutputs, useReposeBatchItems } from "./useReposeBatches";
import type { ReposeOutput } from "@/types/repose";
import { OutputShotType, slotToShotType, ALL_OUTPUT_SHOT_TYPES } from "@/types/shot-types";
import { MAX_FAVORITES_PER_VIEW } from "@/types/repose";

export interface LookWithOutputs {
  lookId: string;
  lookCode: string;
  batchItemId: string;
  sourceUrl: string;
  outputsByView: Record<OutputShotType, ReposeOutput[]>;
  selectionStats: ViewSelectionStats;
}

export interface ViewSelectionStats {
  byView: Record<OutputShotType, { selected: number; total: number; isComplete: boolean }>;
  totalViews: number;
  completedViews: number;
  isAllComplete: boolean;
}

export function useReposeSelection(batchId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: outputs, isLoading: outputsLoading, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);

  // Mutation to set favorite rank
  const setFavoriteRank = useMutation({
    mutationFn: async ({ 
      outputId, 
      rank 
    }: { 
      outputId: string; 
      rank: 1 | 2 | 3 | null;
    }) => {
      const { error } = await supabase
        .from("repose_outputs")
        .update({
          is_favorite: rank !== null,
          favorite_rank: rank,
          selected_at: rank !== null ? new Date().toISOString() : null,
        })
        .eq("id", outputId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repose-outputs", batchId] });
    },
    onError: (error) => {
      toast.error(`Failed to update selection: ${error.message}`);
    },
  });

  // Mutation to swap ranks between two outputs
  const swapRanks = useMutation({
    mutationFn: async ({ 
      outputId1, 
      rank1,
      outputId2, 
      rank2 
    }: { 
      outputId1: string; 
      rank1: 1 | 2 | 3 | null;
      outputId2: string; 
      rank2: 1 | 2 | 3 | null;
    }) => {
      // Update both in parallel
      const [res1, res2] = await Promise.all([
        supabase
          .from("repose_outputs")
          .update({
            is_favorite: rank2 !== null,
            favorite_rank: rank2,
            selected_at: rank2 !== null ? new Date().toISOString() : null,
          })
          .eq("id", outputId1),
        supabase
          .from("repose_outputs")
          .update({
            is_favorite: rank1 !== null,
            favorite_rank: rank1,
            selected_at: rank1 !== null ? new Date().toISOString() : null,
          })
          .eq("id", outputId2),
      ]);

      if (res1.error) throw res1.error;
      if (res2.error) throw res2.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repose-outputs", batchId] });
    },
    onError: (error) => {
      toast.error(`Failed to swap selections: ${error.message}`);
    },
  });

  // Clear all selections for a view
  const clearViewSelections = useMutation({
    mutationFn: async ({ 
      batchItemId, 
      shotType 
    }: { 
      batchItemId: string; 
      shotType: OutputShotType;
    }) => {
      const { error } = await supabase
        .from("repose_outputs")
        .update({
          is_favorite: false,
          favorite_rank: null,
          selected_at: null,
        })
        .eq("batch_item_id", batchItemId)
        .eq("shot_type", shotType);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repose-outputs", batchId] });
    },
    onError: (error) => {
      toast.error(`Failed to clear selections: ${error.message}`);
    },
  });

  // Group outputs by look, then by view (shot type)
  const groupedByLook = useMemo<LookWithOutputs[]>(() => {
    if (!outputs || !batchItems) return [];

    const lookMap = new Map<string, LookWithOutputs>();

    // First, create entries from batch items
    for (const item of batchItems) {
      const lookId = item.look_id || item.id; // Use item id as fallback if no look_id
      
      if (!lookMap.has(lookId)) {
        lookMap.set(lookId, {
          lookId,
          lookCode: `Look ${lookId.slice(0, 6)}`, // Will be enriched later
          batchItemId: item.id,
          sourceUrl: item.source_url,
          outputsByView: {} as Record<OutputShotType, ReposeOutput[]>,
          selectionStats: {
            byView: {} as Record<OutputShotType, { selected: number; total: number; isComplete: boolean }>,
            totalViews: 0,
            completedViews: 0,
            isAllComplete: false,
          },
        });
      }
    }

    // Add outputs to their respective looks and views
    for (const output of outputs) {
      const item = batchItems.find(i => i.id === output.batch_item_id);
      if (!item) continue;

      const lookId = item.look_id || item.id;
      const look = lookMap.get(lookId);
      if (!look) continue;

      const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
      
      if (!look.outputsByView[shotType]) {
        look.outputsByView[shotType] = [];
      }
      look.outputsByView[shotType].push(output);
    }

    // Calculate selection stats for each look
    for (const look of lookMap.values()) {
      let totalViews = 0;
      let completedViews = 0;

      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const viewOutputs = look.outputsByView[shotType] || [];
        const completedOutputs = viewOutputs.filter(o => o.status === 'complete');
        const selectedCount = completedOutputs.filter(o => o.is_favorite).length;
        
        if (completedOutputs.length > 0) {
          totalViews++;
          const isComplete = selectedCount >= MAX_FAVORITES_PER_VIEW;
          if (isComplete) completedViews++;

          look.selectionStats.byView[shotType] = {
            selected: selectedCount,
            total: completedOutputs.length,
            isComplete,
          };
        }
      }

      look.selectionStats.totalViews = totalViews;
      look.selectionStats.completedViews = completedViews;
      look.selectionStats.isAllComplete = totalViews > 0 && completedViews === totalViews;
    }

    return Array.from(lookMap.values());
  }, [outputs, batchItems]);

  // Overall stats
  const overallStats = useMemo(() => {
    const totalLooks = groupedByLook.length;
    const completedLooks = groupedByLook.filter(l => l.selectionStats.isAllComplete).length;
    const totalFavorites = outputs?.filter(o => o.is_favorite).length || 0;

    return {
      totalLooks,
      completedLooks,
      totalFavorites,
      isAllComplete: totalLooks > 0 && completedLooks === totalLooks,
    };
  }, [groupedByLook, outputs]);

  // Get next available rank for a view
  const getNextAvailableRank = useCallback((batchItemId: string, shotType: OutputShotType): 1 | 2 | 3 | null => {
    const viewOutputs = outputs?.filter(o => {
      const oShotType = (o.shot_type || slotToShotType(o.slot || '')) as OutputShotType;
      return o.batch_item_id === batchItemId && oShotType === shotType && o.is_favorite;
    }) || [];

    const usedRanks = new Set(viewOutputs.map(o => o.favorite_rank));
    
    if (!usedRanks.has(1)) return 1;
    if (!usedRanks.has(2)) return 2;
    if (!usedRanks.has(3)) return 3;
    return null; // All ranks used
  }, [outputs]);

  // Check if view is full (3 selections)
  const isViewFull = useCallback((batchItemId: string, shotType: OutputShotType): boolean => {
    return getNextAvailableRank(batchItemId, shotType) === null;
  }, [getNextAvailableRank]);

  // Get favorites for export
  const getFavoritesForExport = useCallback(() => {
    return outputs?.filter(o => o.is_favorite && o.result_url) || [];
  }, [outputs]);

  return {
    outputs,
    batchItems,
    groupedByLook,
    overallStats,
    isLoading: outputsLoading || itemsLoading,
    setFavoriteRank,
    swapRanks,
    clearViewSelections,
    getNextAvailableRank,
    isViewFull,
    getFavoritesForExport,
    refetchOutputs,
  };
}
