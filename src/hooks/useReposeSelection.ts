import { useMemo, useCallback } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReposeOutputs, useReposeBatchItems, ReposeBatchItemWithLook } from "./useReposeBatches";
import type { ReposeOutput } from "@/types/repose";
import { OutputShotType, slotToShotType, ALL_OUTPUT_SHOT_TYPES } from "@/types/shot-types";
import { MAX_FAVORITES_PER_VIEW } from "@/types/repose";

export interface SkippedView {
  id: string;
  batch_id: string;
  look_id: string;
  shot_type: OutputShotType;
  skipped_at: string;
}

export interface LookWithOutputs {
  lookId: string;
  lookCode: string;
  batchItemIds: string[]; // Multiple batch items per look (one per shot type)
  batchItemId: string; // Primary batch item ID for backwards compatibility
  sourceUrl: string;
  sourceUrlsByView: Partial<Record<OutputShotType, string>>; // Source URL per shot type
  outputsByView: Record<OutputShotType, ReposeOutput[]>;
  selectionStats: ViewSelectionStats;
  exportedAt: string | null; // When this look was last exported
}

export interface ViewSelectionStats {
  byView: Record<OutputShotType, { selected: number; total: number; isComplete: boolean; isSkipped: boolean }>;
  totalViews: number;
  completedViews: number;
  skippedViews: number;
  isAllComplete: boolean;
}

export function useReposeSelection(batchId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: outputs, isLoading: outputsLoading, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);

  // Fetch skipped views
  const { data: skippedViews, isLoading: skippedLoading, refetch: refetchSkipped } = useQuery({
    queryKey: ["repose-skipped-views", batchId],
    queryFn: async () => {
      if (!batchId) return [];
      const { data, error } = await supabase
        .from("repose_skipped_views")
        .select("*")
        .eq("batch_id", batchId);
      if (error) throw error;
      return (data || []) as SkippedView[];
    },
    enabled: !!batchId,
  });

  // Helper to check if a view is skipped
  const isViewSkipped = useCallback((lookId: string, shotType: OutputShotType): boolean => {
    return skippedViews?.some(sv => sv.look_id === lookId && sv.shot_type === shotType) || false;
  }, [skippedViews]);

  // Mutation to skip a view
  const skipView = useMutation({
    mutationFn: async ({ 
      lookId, 
      shotType 
    }: { 
      lookId: string; 
      shotType: OutputShotType;
    }) => {
      const { error } = await supabase
        .from("repose_skipped_views")
        .insert({
          batch_id: batchId,
          look_id: lookId,
          shot_type: shotType,
        });

      if (error) throw error;
    },
    onSuccess: (_, { shotType }) => {
      queryClient.invalidateQueries({ queryKey: ["repose-skipped-views", batchId] });
      toast.success(`Skipped ${shotType} - marked as complete`);
    },
    onError: (error) => {
      toast.error(`Failed to skip view: ${error.message}`);
    },
  });

  // Mutation to undo skip
  const undoSkipView = useMutation({
    mutationFn: async ({ 
      lookId, 
      shotType 
    }: { 
      lookId: string; 
      shotType: OutputShotType;
    }) => {
      const { error } = await supabase
        .from("repose_skipped_views")
        .delete()
        .eq("batch_id", batchId)
        .eq("look_id", lookId)
        .eq("shot_type", shotType);

      if (error) throw error;
    },
    onSuccess: (_, { shotType }) => {
      queryClient.invalidateQueries({ queryKey: ["repose-skipped-views", batchId] });
      toast.success(`Restored ${shotType} - selections required`);
    },
    onError: (error) => {
      toast.error(`Failed to undo skip: ${error.message}`);
    },
  });

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
    
    // Build a map of batch item id to look code for quick lookup
    const itemToLookCode = new Map<string, string>();
    for (const item of batchItems as ReposeBatchItemWithLook[]) {
      itemToLookCode.set(item.id, item.look_code || '');
    }

    // First, create entries from batch items
    for (const item of batchItems as ReposeBatchItemWithLook[]) {
      const lookId = item.look_id || item.id; // Use item id as fallback if no look_id
      
      // Generate look code - prefer look_code from talent_looks, fallback to extracting from source_url or ID
      let lookCode = item.look_code;
      if (!lookCode && item.source_url) {
        // Extract filename from URL first (after the last slash)
        const urlParts = item.source_url.split('/');
        const filename = urlParts[urlParts.length - 1] || '';
        // Decode URL encoding and try to extract SKU pattern (e.g., "WW0WW47846C1G", "XM0XM07731FAP")
        const decodedFilename = decodeURIComponent(filename);
        // Look for typical SKU patterns: 2-3 letters + numbers + optional letters (at least 10 chars)
        const skuMatch = decodedFilename.match(/([A-Z]{2,3}[0-9A-Z]{6,}[A-Z0-9]*)/i);
        if (skuMatch) {
          lookCode = skuMatch[1].toUpperCase();
        }
      }
      if (!lookCode) {
        lookCode = `Look ${lookId.slice(0, 6)}`;
      }
      
      // Determine which shot types this batch item provides based on assigned_view
      // with fallback detection from view field or source_url
      let detectedView = item.assigned_view?.toLowerCase();
      const itemSourceUrl = item.source_url;
      
      // Fallback: detect view from the 'view' field if assigned_view is null
      if (!detectedView && (item as any).view) {
        const viewLower = ((item as any).view as string).toLowerCase();
        if (viewLower.includes('_back') || viewLower.includes('back') || viewLower.includes('-back')) {
          detectedView = 'back';
        } else if (viewLower.includes('_front') || viewLower.includes('front') || viewLower.includes('-front')) {
          detectedView = 'front';
        }
      }
      
      // Also check source_url as final fallback
      if (!detectedView && itemSourceUrl) {
        const urlLower = itemSourceUrl.toLowerCase();
        // Check for back patterns first (more specific)
        if (urlLower.includes('/back-') || urlLower.includes('/back_') || urlLower.includes('_back') || urlLower.includes('-back.')) {
          detectedView = 'back';
        } else if (urlLower.includes('/detail-') || urlLower.includes('/detail_')) {
          // Detail images should use the front source image for display
          detectedView = 'front';
        } else if (urlLower.includes('/front-') || urlLower.includes('/front_') || urlLower.includes('_front') || urlLower.includes('-front.')) {
          detectedView = 'front';
        }
      }
      
      // Helper to apply source URL to shot types based on detected view
      const applySourceUrlToShotTypes = (
        sourceUrlsByView: Partial<Record<OutputShotType, string>>,
        view: string | undefined,
        url: string
      ) => {
        if (!url || !view) return;
        
        if (view === 'front') {
          // Front source is used for FRONT_FULL, FRONT_CROPPED, and DETAIL
          sourceUrlsByView.FRONT_FULL = url;
          sourceUrlsByView.FRONT_CROPPED = url;
          sourceUrlsByView.DETAIL = url;
        } else if (view === 'back') {
          sourceUrlsByView.BACK_FULL = url;
        }
      };
      
      if (!lookMap.has(lookId)) {
        const sourceUrlsByView: Partial<Record<OutputShotType, string>> = {};
        
        // Map detected view to shot types
        applySourceUrlToShotTypes(sourceUrlsByView, detectedView, itemSourceUrl);
        
        // Find front URL for this look from all batch items (handles any processing order)
        let headerUrl = detectedView === 'front' ? itemSourceUrl : '';
        if (!headerUrl) {
          // Look ahead to find a front image for this look
          const frontItem = (batchItems as ReposeBatchItemWithLook[]).find(bi => {
            if ((bi.look_id || bi.id) !== lookId) return false;
            const biView = bi.assigned_view?.toLowerCase() || '';
            const biViewField = ((bi as any).view as string || '').toLowerCase();
            const biUrl = (bi.source_url || '').toLowerCase();
            return biView === 'front' || 
                   biViewField.includes('_front') || biViewField.includes('front') ||
                   biUrl.includes('/front-') || biUrl.includes('/front_');
          });
          if (frontItem) {
            headerUrl = frontItem.source_url || '';
          }
        }
        
        lookMap.set(lookId, {
          lookId,
          lookCode,
          batchItemIds: [item.id],
          batchItemId: item.id,
          sourceUrl: headerUrl,
          sourceUrlsByView,
          outputsByView: {} as Record<OutputShotType, ReposeOutput[]>,
          selectionStats: {
            byView: {} as Record<OutputShotType, { selected: number; total: number; isComplete: boolean; isSkipped: boolean }>,
            totalViews: 0,
            completedViews: 0,
            skippedViews: 0,
            isAllComplete: false,
          },
          exportedAt: item.exported_at || null,
        });
      } else {
        const existingLook = lookMap.get(lookId)!;
        
        // Update header thumbnail - prefer front, fallback to any
        if (detectedView === 'front') {
          existingLook.sourceUrl = itemSourceUrl;
        } else if (!existingLook.sourceUrl && itemSourceUrl) {
          existingLook.sourceUrl = itemSourceUrl;
        }
        
        // Update exportedAt if this batch item has a more recent export
        if (item.exported_at && (!existingLook.exportedAt || item.exported_at > existingLook.exportedAt)) {
          existingLook.exportedAt = item.exported_at;
        }
        
        // Add additional batch item ID to existing look
        if (!existingLook.batchItemIds.includes(item.id)) {
          existingLook.batchItemIds.push(item.id);
        }
        
        // Add source URLs for this batch item's shot types
        applySourceUrlToShotTypes(existingLook.sourceUrlsByView, detectedView, itemSourceUrl);
      }
    }

    // Add outputs to their respective looks and views (prevent duplicates)
    const processedOutputIds = new Set<string>();
    for (const output of outputs) {
      // Skip if already processed (prevents duplicate counting)
      if (processedOutputIds.has(output.id)) continue;
      processedOutputIds.add(output.id);

      const item = batchItems.find(i => i.id === output.batch_item_id);
      if (!item) continue;

      const lookId = item.look_id || item.id;
      const look = lookMap.get(lookId);
      if (!look) continue;

      const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
      
      if (!look.outputsByView[shotType]) {
        look.outputsByView[shotType] = [];
      }
      
      // Double-check to prevent duplicates within view
      if (!look.outputsByView[shotType].some(o => o.id === output.id)) {
        look.outputsByView[shotType].push(output);
      }
    }

    // Calculate selection stats for each look
    for (const look of lookMap.values()) {
      let totalViews = 0;
      let completedViews = 0;
      let skippedViewsCount = 0;

      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const viewOutputs = look.outputsByView[shotType] || [];
        const completedOutputs = viewOutputs.filter(o => o.status === 'complete');
        const selectedCount = completedOutputs.filter(o => o.is_favorite).length;
        const viewIsSkipped = isViewSkipped(look.lookId, shotType);
        
        if (viewOutputs.length > 0 || viewIsSkipped) {
          totalViews++;
          const isComplete = selectedCount >= MAX_FAVORITES_PER_VIEW || viewIsSkipped;
          if (isComplete) completedViews++;
          if (viewIsSkipped) skippedViewsCount++;

          look.selectionStats.byView[shotType] = {
            selected: selectedCount,
            total: completedOutputs.length,
            isComplete,
            isSkipped: viewIsSkipped,
          };
        }
      }

      look.selectionStats.totalViews = totalViews;
      look.selectionStats.completedViews = completedViews;
      look.selectionStats.skippedViews = skippedViewsCount;
      look.selectionStats.isAllComplete = totalViews > 0 && completedViews === totalViews;
    }

    return Array.from(lookMap.values());
  }, [outputs, batchItems, isViewSkipped]);

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

  // Get next available rank for a view (now accepts batchItemId or lookId via batchItemIds array)
  const getNextAvailableRank = useCallback((batchItemId: string, shotType: OutputShotType): 1 | 2 | 3 | null => {
    // Find the look that contains this batch item
    const look = groupedByLook.find(l => l.batchItemIds.includes(batchItemId));
    if (!look) {
      // Fallback to single batch item filtering
      const viewOutputs = outputs?.filter(o => {
        const oShotType = (o.shot_type || slotToShotType(o.slot || '')) as OutputShotType;
        return o.batch_item_id === batchItemId && oShotType === shotType && o.is_favorite;
      }) || [];
      const usedRanks = new Set(viewOutputs.map(o => o.favorite_rank));
      if (!usedRanks.has(1)) return 1;
      if (!usedRanks.has(2)) return 2;
      if (!usedRanks.has(3)) return 3;
      return null;
    }

    // Use the pre-calculated stats from the look
    const viewOutputs = look.outputsByView[shotType] || [];
    const selectedOutputs = viewOutputs.filter(o => o.is_favorite && o.status === 'complete');
    const usedRanks = new Set(selectedOutputs.map(o => o.favorite_rank));
    
    if (!usedRanks.has(1)) return 1;
    if (!usedRanks.has(2)) return 2;
    if (!usedRanks.has(3)) return 3;
    return null;
  }, [outputs, groupedByLook]);

  // Check if view is full (3 selections)
  const isViewFull = useCallback((batchItemId: string, shotType: OutputShotType): boolean => {
    return getNextAvailableRank(batchItemId, shotType) === null;
  }, [getNextAvailableRank]);

  // Get favorites for export
  const getFavoritesForExport = useCallback(() => {
    return outputs?.filter(o => o.is_favorite && o.result_url) || [];
  }, [outputs]);

  // Refetch all data
  const refetchAll = useCallback(() => {
    refetchOutputs();
    refetchSkipped();
  }, [refetchOutputs, refetchSkipped]);

  return {
    outputs,
    batchItems,
    groupedByLook,
    overallStats,
    skippedViews,
    isLoading: outputsLoading || itemsLoading || skippedLoading,
    setFavoriteRank,
    swapRanks,
    clearViewSelections,
    getNextAvailableRank,
    isViewFull,
    isViewSkipped,
    skipView,
    undoSkipView,
    getFavoritesForExport,
    refetchOutputs,
    refetchAll,
  };
}
