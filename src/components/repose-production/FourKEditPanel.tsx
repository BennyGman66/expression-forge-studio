import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, 
  Check, 
  X, 
  RefreshCw,
  ImageIcon,
  Sparkles,
  Zap,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/imageUtils";

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
  source_url?: string | null;
  look_code?: string;
  // 4K version info
  fourK_output_id?: string;
  fourK_status?: string;
  fourK_result_url?: string | null;
  fourK_error?: string | null;
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

  // Fetch all favorites for this batch
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
          favorite_rank
        `)
        .eq("batch_id", batchId)
        .eq("is_favorite", true)
        .eq("status", "complete")
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
            // Fetch look codes - cast to any to bypass type inference issues with 'looks' table
            const { data: looksData } = await (supabase as any)
              .from("looks")
              .select("id, look_code")
              .in("id", lookIds);
            
            if (looksData) {
              const lookIdToCode: Record<string, string> = {};
              looksData.forEach((l) => { 
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

      // Check for existing 4K versions of these favorites (by matching batch_item + shot_type + pose_url)
      const favoriteIds = (favData || []).map((f) => f.id);
      let fourKVersions: Record<string, { id: string; status: string; result_url: string | null; error_message: string | null }> = {};
      
      if (favoriteIds.length > 0) {
        // Find 4K outputs that reference these favorites (via matching batch_item + shot_type + pose_url, created after the original)
        const { data: fourKData } = await supabase
          .from("repose_outputs")
          .select("id, batch_item_id, shot_type, pose_url, status, result_url, error_message, created_at")
          .eq("batch_id", batchId)
          .in("status", ["queued", "running", "uploading", "failed", "complete"])
          .eq("is_favorite", false); // 4K versions are not favorites

        if (fourKData) {
          // Match by batch_item_id + shot_type + pose_url - find latest 4K attempt for each favorite
          favData?.forEach((fav) => {
            const matching4K = fourKData
              .filter((fourK) => 
                fourK.batch_item_id === fav.batch_item_id &&
                fourK.shot_type === fav.shot_type &&
                fourK.pose_url === fav.pose_url &&
                fourK.id !== fav.id // Not the same output
              )
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

            if (matching4K) {
              fourKVersions[fav.id] = {
                id: matching4K.id,
                status: matching4K.status,
                result_url: matching4K.result_url,
                error_message: matching4K.error_message,
              };
            }
          });
        }
      }

      // Combine favorites with look codes and 4K status
      const enriched: FavoriteOutput[] = (favData || []).map((f) => ({
        ...f,
        source_url: batchItemInfo[f.batch_item_id]?.source_url,
        look_code: lookCodes[f.batch_item_id],
        fourK_output_id: fourKVersions[f.id]?.id,
        fourK_status: fourKVersions[f.id]?.status,
        fourK_result_url: fourKVersions[f.id]?.result_url,
        fourK_error: fourKVersions[f.id]?.error_message,
      }));

      setFavorites(enriched);
    } finally {
      setIsLoading(false);
    }
  }, [batchId]);

  // Initial fetch
  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Realtime subscription for updates
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`4k-favorites-${batchId}`)
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

  // Trigger individual 4K render
  const handleRender4K = async (favorite: FavoriteOutput) => {
    if (!batchId) return;
    
    // Prevent double-click
    if (renderingIds.has(favorite.id)) return;
    
    setRenderingIds((prev) => new Set(prev).add(favorite.id));
    
    try {
      // Create a new output record for the 4K version
      const { data: newOutput, error: insertError } = await supabase
        .from("repose_outputs")
        .insert({
          batch_id: batchId,
          batch_item_id: favorite.batch_item_id,
          shot_type: favorite.shot_type,
          pose_url: favorite.pose_url,
          status: "queued",
          is_favorite: false, // 4K version isn't a favorite yet
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.info("Starting 4K render...");

      // Call generate-repose-single directly with 4K size
      const { data, error } = await supabase.functions.invoke("generate-repose-single", {
        body: {
          outputId: newOutput.id,
          model: "imagen-3.0-generate-002",
          imageSize: "4K",
        },
      });

      if (error) throw error;

      if (data?.status === "uploading") {
        toast.success("4K render started - processing in background");
      } else if (data?.error) {
        toast.error(`Render failed: ${data.error}`);
      }

      // Refresh to show the new 4K output
      fetchFavorites();
    } catch (error) {
      console.error("Error starting 4K render:", error);
      toast.error("Failed to start 4K render");
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
    const with4K = filteredFavorites.filter((f) => f.fourK_status === "complete").length;
    const rendering = filteredFavorites.filter((f) => f.fourK_status === "running" || f.fourK_status === "uploading" || f.fourK_status === "queued").length;
    const failed = filteredFavorites.filter((f) => f.fourK_status === "failed").length;
    return { total, allTotal, with4K, rendering, failed };
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

  if (!batchId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select a batch first
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              4K Re-render
            </CardTitle>
            
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
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Click any favorite to render it in 4K resolution. Each tile shows the original 1K render.
          </p>
          
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
              {stats.with4K > 0 && (
                <Badge variant="outline" className="gap-1.5 text-green-600 border-green-200">
                  <Check className="w-3 h-3" />
                  {stats.with4K} in 4K
                </Badge>
              )}
              {stats.rendering > 0 && (
                <Badge variant="outline" className="gap-1.5 text-blue-600 border-blue-200">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {stats.rendering} Rendering
                </Badge>
              )}
              {stats.failed > 0 && (
                <Badge variant="destructive" className="gap-1.5">
                  <X className="w-3 h-3" />
                  {stats.failed} Failed
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
                        onRender={() => handleRender4K(fav)}
                        isRendering={renderingIds.has(fav.id)}
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
  );
}

// Individual favorite tile component
interface FavoriteTileProps {
  favorite: FavoriteOutput;
  onRender: () => void;
  isRendering: boolean;
}

function FavoriteTile({ favorite, onRender, isRendering }: FavoriteTileProps) {
  const [isImgLoading, setIsImgLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const thumbnailUrl = favorite.result_url ? getImageUrl(favorite.result_url, "thumb") : null;
  const sku = favorite.look_code || extractSKU(favorite.source_url);
  const shotLabel = SHOT_TYPE_LABELS[favorite.shot_type] || favorite.shot_type;

  // Determine 4K status
  const has4K = favorite.fourK_status === "complete";
  const is4KRendering = favorite.fourK_status === "running" || favorite.fourK_status === "uploading" || favorite.fourK_status === "queued" || isRendering;
  const is4KFailed = favorite.fourK_status === "failed";

  const handleClick = () => {
    if (!has4K && !is4KRendering) {
      onRender();
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering render
    
    // Use 4K URL if available, otherwise original
    const downloadUrl = favorite.fourK_result_url || favorite.result_url;
    if (!downloadUrl) {
      toast.error("No image available to download");
      return;
    }
    
    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      // Build filename: SKU_ShotType_Rank.png
      const shotLabelClean = shotLabel.replace(/\s+/g, "_");
      const rankSuffix = RANK_LABELS[favorite.favorite_rank] || `${favorite.favorite_rank}`;
      link.download = `${sku}_${shotLabelClean}_${rankSuffix}.png`;
      
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
        has4K && "border-green-500/50 ring-2 ring-green-500/20",
        is4KRendering && "border-blue-500/50",
        is4KFailed && "border-destructive/50",
        !has4K && !is4KRendering && !is4KFailed && "border-muted-foreground/30 hover:border-purple-400 hover:ring-2 hover:ring-purple-400/20"
      )}
    >
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

      {/* 4K rendering overlay */}
      {is4KRendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-xs font-medium text-blue-500">Rendering 4K...</span>
        </div>
      )}

      {/* 4K failed overlay */}
      {is4KFailed && !is4KRendering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
          <X className="w-8 h-8 text-destructive" />
          <span className="text-xs font-medium text-destructive">4K Failed</span>
          {favorite.fourK_error && (
            <span className="text-[10px] text-destructive/70 px-2 text-center line-clamp-2">
              {favorite.fourK_error}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">Click to retry</span>
        </div>
      )}

      {/* Hover overlay for items without 4K */}
      {!has4K && !is4KRendering && !is4KFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
          <Zap className="w-8 h-8 text-purple-500" />
          <span className="text-xs font-medium text-purple-500">Click to render 4K</span>
        </div>
      )}

      {/* 4K complete badge */}
      {has4K && (
        <Badge className="absolute top-1 right-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 gap-1">
          <Check className="w-2.5 h-2.5" />
          4K
        </Badge>
      )}

      {/* Rank badge */}
      <Badge
        variant="secondary"
        className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 bg-background/80 font-bold"
      >
        #{favorite.favorite_rank}
      </Badge>

      {/* Download button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-10 h-6 w-6 bg-background/80 hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleDownload}
        title={`Download ${has4K ? "4K" : "original"} image`}
      >
        <Download className="w-3.5 h-3.5" />
      </Button>

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
