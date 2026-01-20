import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, 
  Check, 
  RefreshCw,
  ImageIcon,
  Sparkles,
  Zap,
  Download,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/imageUtils";
import { useFourKQueue } from "@/hooks/useFourKQueue";

interface FourKEditPanelProps {
  batchId: string | undefined;
}

interface FavoriteOutput {
  id: string;
  batch_item_id: string;
  shot_type: string;
  status: string;
  result_url: string | null;
  pose_url: string | null;
  favorite_rank: number;
  requested_resolution: string | null;
  source_url?: string | null;
  look_code?: string;
}

// Extract SKU from source URL filename
function extractSKU(sourceUrl: string | null | undefined): string {
  if (!sourceUrl) return "Unknown";
  try {
    const filename = sourceUrl.split("/").pop() || "";
    // Try to extract SKU pattern (e.g., "MW02234" or similar)
    const match = filename.match(/([A-Z]{2}\d{5,})/i);
    if (match) return match[1].toUpperCase();
    // Fall back to first part of filename
    const cleanName = filename.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    return cleanName.slice(0, 12) || "Unknown";
  } catch {
    return "Unknown";
  }
}

const SHOT_TYPE_LABELS: Record<string, string> = {
  FRONT_FULL: "Full Front",
  FRONT_CROPPED: "Cropped",
  DETAIL: "Detail",
  BACK_FULL: "Back",
};

const RANK_LABELS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
};

export function FourKEditPanel({ batchId }: FourKEditPanelProps) {
  const [favorites, setFavorites] = useState<FavoriteOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [selectedShotTypes, setSelectedShotTypes] = useState<Set<string>>(new Set());
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [skuSearch, setSkuSearch] = useState('');
  const [selectedResolution, setSelectedResolution] = useState<'2K' | '4K'>('2K');
  
  // Selection mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isQueueOpen, setIsQueueOpen] = useState(true);

  // Fetch favorites callback
  const fetchFavorites = useCallback(async () => {
    if (!batchId) return;

    try {
      // Get all favorited outputs with their batch item info
      const { data: favData, error: favError } = await supabase
        .from("repose_outputs")
        .select(`
          id,
          batch_item_id,
          shot_type,
          status,
          result_url,
          pose_url,
          favorite_rank,
          requested_resolution
        `)
        .eq("batch_id", batchId)
        .eq("is_favorite", true)
        .not("result_url", "is", null)
        .order("favorite_rank", { ascending: true });

      if (favError) {
        console.error("Error fetching favorites:", favError);
        return;
      }

      // Get batch items with source URLs and look IDs
      const batchItemIds = [...new Set((favData || []).map((f) => f.batch_item_id))];
      
      let batchItemInfo: Record<string, { source_url: string | null; look_id: string | null }> = {};
      let lookCodes: Record<string, string> = {};
      
      if (batchItemIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("repose_batch_items")
          .select("id, source_url, look_id")
          .in("id", batchItemIds);
        
        if (itemsData) {
          itemsData.forEach((i) => {
            batchItemInfo[i.id] = { source_url: i.source_url, look_id: i.look_id };
          });
          
          const lookIds = [...new Set(itemsData.map((i) => i.look_id).filter(Boolean))] as string[];
          if (lookIds.length > 0) {
            // Fetch look codes
            const { data: looksData } = await (supabase as any)
              .from("talent_looks")
              .select("id, look_code")
              .in("id", lookIds);
            
            if (looksData) {
              const lookIdToCode: Record<string, string> = {};
              looksData.forEach((l: { id: string; look_code: string }) => { 
                lookIdToCode[l.id] = l.look_code; 
              });
              itemsData.forEach((i) => {
                if (i.look_id && lookIdToCode[i.look_id]) {
                  lookCodes[i.id] = lookIdToCode[i.look_id];
                }
              });
            }
          }
        }
      }

      // Combine favorites with look codes
      const enriched: FavoriteOutput[] = (favData || []).map((f) => ({
        ...f,
        source_url: batchItemInfo[f.batch_item_id]?.source_url,
        look_code: lookCodes[f.batch_item_id],
      }));

      setFavorites(enriched);
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  // Queue hook
  const {
    queue,
    isProcessing,
    addToQueue,
    clearQueue,
    clearCompleted,
    retryFailed,
    pendingCount,
    processingCount,
    completedCount,
    failedCount,
  } = useFourKQueue({ onComplete: fetchFavorites });

  // Toggle shot type filter
  const toggleShotType = (type: string) => {
    setSelectedShotTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Toggle rank filter
  const toggleRank = (rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all filtered
  const selectAll = () => {
    setSelectedIds(new Set(filteredFavorites.map((f) => f.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Queue selected items
  const queueSelected = () => {
    const itemsToQueue = filteredFavorites
      .filter((f) => selectedIds.has(f.id))
      .map((f) => ({
        outputId: f.id,
        sku: f.look_code || extractSKU(f.source_url),
        shotType: SHOT_TYPE_LABELS[f.shot_type] || f.shot_type,
        rank: f.favorite_rank,
        resolution: selectedResolution,
      }));

    if (itemsToQueue.length === 0) {
      toast.error("No items selected");
      return;
    }

    addToQueue(itemsToQueue);
    toast.success(`Queued ${itemsToQueue.length} items for ${selectedResolution} re-render`);
    clearSelection();
    setIsSelectMode(false);
    setIsQueueOpen(true);
  };

  // Filter favorites by selected shot types, ranks, and SKU search
  const filteredFavorites = useMemo(() => {
    let result = favorites;
    if (selectedShotTypes.size > 0) {
      result = result.filter((f) => selectedShotTypes.has(f.shot_type));
    }
    if (selectedRanks.size > 0) {
      result = result.filter((f) => selectedRanks.has(f.favorite_rank));
    }
    if (skuSearch.trim()) {
      const search = skuSearch.trim().toLowerCase();
      result = result.filter((f) => {
        const sku = f.look_code || extractSKU(f.source_url);
        return sku.toLowerCase().includes(search);
      });
    }
    return result;
  }, [favorites, selectedShotTypes, selectedRanks, skuSearch]);

  // Initial fetch
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Realtime subscription for updates
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`highres-favorites-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "repose_outputs",
          filter: `batch_id=eq.${batchId}`,
        },
        () => {
          fetchFavorites();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, fetchFavorites]);

  // Re-render the SAME output at higher resolution (single item mode)
  const handleRerender = async (favorite: FavoriteOutput) => {
    if (renderingIds.has(favorite.id)) return;
    
    setRenderingIds((prev) => new Set(prev).add(favorite.id));
    
    try {
      toast.info(`Re-rendering at ${selectedResolution}...`);

      // Call generate-repose-single with the SAME outputId
      const { data, error } = await supabase.functions.invoke("generate-repose-single", {
        body: {
          outputId: favorite.id,
          imageSize: selectedResolution,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(`Re-render failed: ${data.error}`);
      } else {
        toast.success(`${selectedResolution} render started`);
      }

      fetchFavorites();
    } catch (error) {
      console.error(`Error re-rendering:`, error);
      toast.error(`Failed to start re-render`);
    } finally {
      setRenderingIds((prev) => {
        const next = new Set(prev);
        next.delete(favorite.id);
        return next;
      });
    }
  };

  // Stats - based on filtered favorites
  const stats = useMemo(() => {
    const total = filteredFavorites.length;
    const allTotal = favorites.length;
    const at2K = filteredFavorites.filter((f) => f.requested_resolution === "2K").length;
    const at4K = filteredFavorites.filter((f) => f.requested_resolution === "4K").length;
    const rendering = filteredFavorites.filter((f) => f.status === "running" || f.status === "uploading" || f.status === "queued").length;
    return { total, allTotal, at2K, at4K, rendering };
  }, [favorites, filteredFavorites]);

  // Group by look code for easier browsing (using filtered favorites)
  const groupedByLook = useMemo(() => {
    const groups: Record<string, FavoriteOutput[]> = {};
    filteredFavorites.forEach((f) => {
      const key = f.look_code || extractSKU(f.source_url);
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    // Sort groups by look code
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredFavorites]);

  // Queue active indicator
  const hasActiveQueue = pendingCount > 0 || processingCount > 0;

  if (!batchId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a batch first
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 gap-4">
        {/* Header */}
        <Card>
          <CardHeader className="py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                High-Res Re-render
              </CardTitle>
              
              <div className="flex items-center gap-2">
                {/* Select mode toggle */}
                <Button
                  variant={isSelectMode ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setIsSelectMode(!isSelectMode);
                    if (isSelectMode) clearSelection();
                  }}
                >
                  {isSelectMode ? (
                    <>
                      <X className="w-4 h-4" />
                      Exit Select
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      Select
                    </>
                  )}
                </Button>

                {/* Resolution toggle */}
                <div className="flex items-center border rounded-md overflow-hidden">
                  <Button
                    variant={selectedResolution === '2K' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 px-3 rounded-none"
                    onClick={() => setSelectedResolution('2K')}
                  >
                    2K
                  </Button>
                  <Button
                    variant={selectedResolution === '4K' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 px-3 rounded-none"
                    onClick={() => setSelectedResolution('4K')}
                  >
                    4K
                  </Button>
                </div>
                
                {/* Reset stuck renders */}
                {favorites.filter(f => f.status === 'running').length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const stuckIds = favorites.filter(f => f.status === 'running').map(f => f.id);
                      await supabase
                        .from('repose_outputs')
                        .update({ status: 'complete', error_message: null })
                        .in('id', stuckIds);
                      toast.success(`Reset ${stuckIds.length} stuck render(s)`);
                      fetchFavorites();
                    }}
                    className="gap-2 text-orange-600"
                  >
                    Reset {favorites.filter(f => f.status === 'running').length} Stuck
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchFavorites}
                  className="gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              {isSelectMode 
                ? `Select items and queue them for batch ${selectedResolution} re-rendering.`
                : `Click any favorite to re-render it at ${selectedResolution} resolution. The image will be replaced in place.`
              }
            </p>
            
            {/* Selection actions */}
            {isSelectMode && (
              <div className="flex items-center gap-2 mb-3 p-2 bg-muted/50 rounded-lg">
                <Badge variant="secondary" className="gap-1">
                  {selectedIds.size} selected
                </Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll}>
                  Select All ({filteredFavorites.length})
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                  Clear
                </Button>
                <div className="flex-1" />
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={selectedIds.size === 0}
                  onClick={queueSelected}
                >
                  <Zap className="w-4 h-4" />
                  Queue {selectedIds.size} at {selectedResolution}
                </Button>
              </div>
            )}
            
            {/* Filter buttons */}
            <div className="flex flex-col gap-2">
              {/* SKU search */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-10">SKU:</span>
                <Input
                  placeholder="Search by SKU..."
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  className="h-7 text-xs w-48"
                />
                {skuSearch && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs px-2"
                    onClick={() => setSkuSearch('')}
                  >
                    ✕
                  </Button>
                )}
              </div>
              
              {/* Shot type filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground w-10">Shot:</span>
                {Object.entries(SHOT_TYPE_LABELS).map(([type, label]) => (
                  <Button
                    key={type}
                    variant={selectedShotTypes.has(type) ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleShotType(type)}
                  >
                    {label}
                  </Button>
                ))}
                {selectedShotTypes.size > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setSelectedShotTypes(new Set())}
                  >
                    Clear
                  </Button>
                )}
              </div>
              
              {/* Rank filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground w-10">Rank:</span>
                {[1, 2, 3].map((rank) => (
                  <Button
                    key={rank}
                    variant={selectedRanks.has(rank) ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleRank(rank)}
                  >
                    #{rank}
                  </Button>
                ))}
                {selectedRanks.size > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setSelectedRanks(new Set())}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Stats bar */}
            {stats.allTotal > 0 && (
              <div className="flex items-center gap-4 mt-3">
                <Badge variant="outline" className="gap-1.5">
                  <ImageIcon className="w-3 h-3" />
                  {selectedShotTypes.size > 0 
                    ? `${stats.total} of ${stats.allTotal} Favorites`
                    : `${stats.total} Favorites`
                  }
                </Badge>
                {stats.at2K > 0 && (
                  <Badge variant="outline" className="gap-1.5 text-blue-600 border-blue-200">
                    <Check className="w-3 h-3" />
                    {stats.at2K} at 2K
                  </Badge>
                )}
                {stats.at4K > 0 && (
                  <Badge variant="outline" className="gap-1.5 text-green-600 border-green-200">
                    <Check className="w-3 h-3" />
                    {stats.at4K} at 4K
                  </Badge>
                )}
                {stats.rendering > 0 && (
                  <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-200">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {stats.rendering} Rendering
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Favorites grid */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">No favorites found</p>
                <p className="text-sm">Mark some outputs as favorites in the Review tab first</p>
              </div>
            ) : (
              <div className="space-y-6 p-4">
                {groupedByLook.map(([lookCode, lookFavorites]) => (
                  <div key={lookCode}>
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-muted">{lookCode}</span>
                      <span className="text-xs">({lookFavorites.length} favorites)</span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {lookFavorites.map((fav) => (
                        <FavoriteTile
                          key={fav.id}
                          favorite={fav}
                          onRerender={() => handleRerender(fav)}
                          isRendering={renderingIds.has(fav.id) || fav.status === "running" || fav.status === "uploading"}
                          selectedResolution={selectedResolution}
                          isSelectMode={isSelectMode}
                          isSelected={selectedIds.has(fav.id)}
                          onToggleSelect={() => toggleSelection(fav.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Queue panel - right sidebar */}
      {(hasActiveQueue || queue.length > 0) && (
        <Card className="w-72 flex-shrink-0">
          <Collapsible open={isQueueOpen} onOpenChange={setIsQueueOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {isQueueOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Queue
                    {hasActiveQueue && (
                      <Badge variant="secondary" className="ml-1">
                        {pendingCount + processingCount}
                      </Badge>
                    )}
                  </CardTitle>
                  
                  {isProcessing && (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="pt-0">
                {/* Queue stats */}
                <div className="flex flex-wrap gap-1 mb-3 text-xs">
                  {pendingCount > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <Square className="w-2.5 h-2.5" />
                      {pendingCount} queued
                    </Badge>
                  )}
                  {processingCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      {processingCount} running
                    </Badge>
                  )}
                  {completedCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                      <Check className="w-2.5 h-2.5" />
                      {completedCount} done
                    </Badge>
                  )}
                  {failedCount > 0 && (
                    <Badge variant="outline" className="gap-1 text-red-600 border-red-200">
                      <AlertCircle className="w-2.5 h-2.5" />
                      {failedCount} failed
                    </Badge>
                  )}
                </div>

                {/* Queue actions */}
                <div className="flex gap-1 mb-3">
                  {failedCount > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={retryFailed}>
                      <RotateCcw className="w-3 h-3" />
                      Retry
                    </Button>
                  )}
                  {(completedCount > 0 || failedCount > 0) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearCompleted}>
                      Clear Done
                    </Button>
                  )}
                  {(pendingCount > 0 || processingCount > 0) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={clearQueue}>
                      Cancel
                    </Button>
                  )}
                </div>

                {/* Queue items */}
                <ScrollArea className="h-64">
                  <div className="space-y-1">
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded text-xs",
                          item.status === "processing" && "bg-amber-500/10",
                          item.status === "completed" && "bg-green-500/10",
                          item.status === "failed" && "bg-red-500/10",
                          item.status === "queued" && "bg-muted/50"
                        )}
                      >
                        {item.status === "queued" && <Square className="w-3 h-3 text-muted-foreground" />}
                        {item.status === "processing" && <Loader2 className="w-3 h-3 animate-spin text-amber-500" />}
                        {item.status === "completed" && <Check className="w-3 h-3 text-green-500" />}
                        {item.status === "failed" && <AlertCircle className="w-3 h-3 text-red-500" />}
                        
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.sku}</div>
                          <div className="text-muted-foreground truncate">
                            {item.shotType} • #{item.rank} • {item.resolution}
                          </div>
                          {item.error && (
                            <div className="text-red-500 truncate" title={item.error}>
                              {item.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}

// Individual favorite tile component
interface FavoriteTileProps {
  favorite: FavoriteOutput;
  onRerender: () => void;
  isRendering: boolean;
  selectedResolution: '2K' | '4K';
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function FavoriteTile({ 
  favorite, 
  onRerender, 
  isRendering, 
  selectedResolution,
  isSelectMode = false,
  isSelected = false,
  onToggleSelect
}: FavoriteTileProps) {
  const [isImgLoading, setIsImgLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showPose, setShowPose] = useState(false);

  const thumbnailUrl = favorite.result_url ? getImageUrl(favorite.result_url, "thumb") : null;
  const posePreviewUrl = favorite.pose_url ? getImageUrl(favorite.pose_url, "preview") : null;
  const sku = favorite.look_code || extractSKU(favorite.source_url);
  const shotLabel = SHOT_TYPE_LABELS[favorite.shot_type] || favorite.shot_type;
  
  // Determine current resolution
  const currentRes = favorite.requested_resolution || "1K";

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect?.();
    } else if (!isRendering) {
      onRerender();
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!favorite.result_url) {
      toast.error("No image available to download");
      return;
    }
    
    try {
      const response = await fetch(favorite.result_url);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      // Build filename: SKU_ShotType_Rank_Resolution.png
      const shotLabelClean = shotLabel.replace(/\s+/g, "_");
      const rankSuffix = RANK_LABELS[favorite.favorite_rank] || `${favorite.favorite_rank}`;
      link.download = `${sku}_${shotLabelClean}_${rankSuffix}_${currentRes}.png`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("Download started");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Download failed");
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "relative aspect-[3/4] rounded-lg overflow-hidden border-2 cursor-pointer group",
        "transition-all bg-muted/50",
        isSelectMode && isSelected && "ring-2 ring-purple-500 border-purple-500",
        !isSelectMode && currentRes === "4K" && "border-green-500/50 ring-2 ring-green-500/20",
        !isSelectMode && currentRes === "2K" && "border-blue-500/50 ring-2 ring-blue-500/20",
        isRendering && "border-amber-500/50",
        !isSelectMode && currentRes === "1K" && !isRendering && "border-muted-foreground/30 hover:border-purple-400 hover:ring-2 hover:ring-purple-400/20"
      )}
    >
      {/* Selection checkbox */}
      {isSelectMode && (
        <div className="absolute top-1 left-1 z-30">
          <Checkbox
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={() => onToggleSelect?.()}
            className="h-5 w-5 bg-background/80 border-2"
          />
        </div>
      )}

      {/* Loading state */}
      {isImgLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Thumbnail image */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt={`${sku} - ${shotLabel}`}
          className={cn(
            "w-full h-full object-cover transition-opacity",
            isImgLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          onLoad={() => setIsImgLoading(false)}
          onError={() => {
            setIsImgLoading(false);
            setHasError(true);
          }}
        />
      )}

      {/* Grayscale pose overlay */}
      {showPose && posePreviewUrl && (
        <div className="absolute inset-0 z-20 bg-background/95 flex items-center justify-center p-2">
          <img
            src={posePreviewUrl}
            alt="Grayscale pose reference"
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      )}

      {/* Rendering overlay */}
      {isRendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <span className="text-xs font-medium text-amber-500">Re-rendering...</span>
        </div>
      )}

      {/* Hover overlay - only in non-select mode */}
      {!isRendering && !showPose && !isSelectMode && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
          <Zap className="w-8 h-8 text-purple-500" />
          <span className="text-xs font-medium text-purple-500">
            Re-render at {selectedResolution}
          </span>
          {currentRes !== "1K" && (
            <span className="text-[10px] text-muted-foreground">
              Currently at {currentRes}
            </span>
          )}
        </div>
      )}

      {/* Resolution badge */}
      <Badge 
        className={cn(
          "absolute top-1 right-1 text-[10px] px-1.5 py-0.5 gap-1",
          currentRes === "4K" && "bg-green-600 text-white",
          currentRes === "2K" && "bg-blue-600 text-white",
          currentRes === "1K" && "bg-muted text-muted-foreground"
        )}
      >
        {currentRes === "4K" && <Check className="w-2.5 h-2.5" />}
        {currentRes === "2K" && <Check className="w-2.5 h-2.5" />}
        {currentRes}
      </Badge>

      {/* Rank badge - moved to accommodate checkbox in select mode */}
      <Badge
        variant="secondary"
        className={cn(
          "absolute text-[10px] px-1.5 py-0.5 bg-background/80 font-bold",
          isSelectMode ? "top-7 left-1" : "top-1 left-1"
        )}
      >
        #{favorite.favorite_rank}
      </Badge>

      {/* Download button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-7 right-1 h-6 w-6 bg-background/80 hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleDownload}
        title={`Download ${currentRes} image`}
      >
        <Download className="w-3.5 h-3.5" />
      </Button>

      {/* Grayscale pose toggle */}
      {favorite.pose_url && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "absolute bottom-1 right-1 h-5 w-5 p-0 text-[10px] font-bold rounded transition-all z-30",
            showPose 
              ? "bg-purple-500 text-white hover:bg-purple-600" 
              : "bg-background/80 hover:bg-background opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            setShowPose(!showPose);
          }}
        >
          G
        </Button>
      )}

      {/* Shot type badge */}
      <Badge
        variant="secondary"
        className="absolute bottom-6 left-1 text-[10px] px-1.5 py-0.5 bg-background/80"
      >
        {shotLabel}
      </Badge>

      {/* SKU badge at bottom */}
      <div className="absolute bottom-0 inset-x-0 bg-background/90 py-1 px-1.5 text-center">
        <span className="text-[10px] font-mono font-medium truncate block">
          {sku}
        </span>
      </div>
    </div>
  );
}

export default FourKEditPanel;
