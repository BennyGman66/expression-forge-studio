import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  Wand2, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Loader2,
  RotateCcw,
  Eye,
  AlertCircle
} from "lucide-react";
import type { ReposeBatchItemWithLook } from "@/hooks/useReposeBatches";

interface ViewAssignmentPanelProps {
  batchId: string;
  items: ReposeBatchItemWithLook[];
  onClose: () => void;
  onRefresh: () => void;
}

interface DetectionResult {
  imageUrl: string;
  itemId: string;
  viewType: "front" | "back" | "unknown";
  confidence: number;
  reasoning: string;
}

export function ViewAssignmentPanel({ batchId, items, onClose, onRefresh }: ViewAssignmentPanelProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [detectionResults, setDetectionResults] = useState<Record<string, DetectionResult>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Items without assigned view
  const unassignedItems = items.filter(i => !i.assigned_view);
  const assignedItems = items.filter(i => i.assigned_view);
  
  const frontCount = items.filter(i => i.assigned_view === 'front').length;
  const backCount = items.filter(i => i.assigned_view === 'back').length;

  const toggleItem = (itemId: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setSelectedItems(newSet);
  };

  const selectAllUnassigned = () => {
    setSelectedItems(new Set(unassignedItems.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleAutoDetect = async () => {
    if (selectedItems.size === 0) {
      toast.error("Select items to detect");
      return;
    }

    setIsDetecting(true);
    setDetectProgress(0);
    
    try {
      const imagesToDetect = items
        .filter(i => selectedItems.has(i.id))
        .map(i => ({ url: i.source_url, itemId: i.id }));

      const { data, error } = await supabase.functions.invoke('detect-view-type', {
        body: { 
          images: imagesToDetect,
          batchId,
          saveResults: false // We'll review before saving
        }
      });

      if (error) throw error;

      const results: Record<string, DetectionResult> = {};
      data.results?.forEach((r: DetectionResult) => {
        results[r.itemId] = r;
      });
      setDetectionResults(results);
      
      toast.success(`Detected ${data.summary?.front || 0} front, ${data.summary?.back || 0} back, ${data.summary?.unknown || 0} unknown`);
    } catch (error) {
      console.error("Detection error:", error);
      toast.error("Failed to detect view types");
    } finally {
      setIsDetecting(false);
      setDetectProgress(100);
    }
  };

  const handleSetView = async (view: 'front' | 'back', itemIds?: string[]) => {
    const ids = itemIds || Array.from(selectedItems);
    if (ids.length === 0) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("repose_batch_items")
        .update({ assigned_view: view })
        .in("id", ids);

      if (error) throw error;
      
      toast.success(`Set ${ids.length} item(s) as ${view}`);
      onRefresh();
      setSelectedItems(new Set());
      setDetectionResults({});
    } catch (error) {
      console.error("Error setting view:", error);
      toast.error("Failed to set view type");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearView = async (itemIds?: string[]) => {
    const ids = itemIds || Array.from(selectedItems);
    if (ids.length === 0) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("repose_batch_items")
        .update({ assigned_view: null })
        .in("id", ids);

      if (error) throw error;
      
      toast.success(`Cleared view for ${ids.length} item(s)`);
      onRefresh();
    } catch (error) {
      console.error("Error clearing view:", error);
      toast.error("Failed to clear view type");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAcceptDetections = async () => {
    // Accept all high-confidence detections
    const highConfidence = Object.values(detectionResults).filter(
      r => r.viewType !== 'unknown' && r.confidence >= 0.7
    );

    if (highConfidence.length === 0) {
      toast.error("No high-confidence detections to accept");
      return;
    }

    setIsSaving(true);
    try {
      for (const result of highConfidence) {
        await supabase
          .from("repose_batch_items")
          .update({ assigned_view: result.viewType })
          .eq("id", result.itemId);
      }
      
      toast.success(`Applied ${highConfidence.length} detections`);
      onRefresh();
      setDetectionResults({});
      setSelectedItems(new Set());
    } catch (error) {
      console.error("Error applying detections:", error);
      toast.error("Failed to apply detections");
    } finally {
      setIsSaving(false);
    }
  };

  const highConfidenceCount = Object.values(detectionResults).filter(
    r => r.viewType !== 'unknown' && r.confidence >= 0.7
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Assign View Types</h3>
          <p className="text-sm text-muted-foreground">
            {unassignedItems.length} unassigned • {frontCount} front • {backCount} back
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <Check className="w-4 h-4 mr-1" />
          Done
        </Button>
      </div>

      {/* Action Bar */}
      <Card className="bg-secondary/30">
        <CardContent className="py-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={selectAllUnassigned}
                disabled={unassignedItems.length === 0}
              >
                Select Unassigned ({unassignedItems.length})
              </Button>
              {selectedItems.size > 0 && (
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  Clear ({selectedItems.size})
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedItems.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAutoDetect}
                    disabled={isDetecting}
                  >
                    {isDetecting ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-1" />
                    )}
                    Auto-Detect ({selectedItems.size})
                  </Button>
                  <div className="h-4 w-px bg-border" />
                  <Button
                    size="sm"
                    onClick={() => handleSetView('front')}
                    disabled={isSaving}
                    className="gap-1"
                  >
                    <ArrowRight className="w-3 h-3" />
                    Front
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSetView('back')}
                    disabled={isSaving}
                    className="gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Detection results actions */}
          {Object.keys(detectionResults).length > 0 && (
            <div className="mt-3 pt-3 border-t flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {highConfidenceCount} high-confidence detections ready
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDetectionResults({})}
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptDetections}
                  disabled={highConfidenceCount === 0 || isSaving}
                >
                  Accept All ({highConfidenceCount})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detecting progress */}
      {isDetecting && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Analyzing images with AI...</p>
                <Progress value={detectProgress} className="h-1.5 mt-1.5" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Grid */}
      <ScrollArea className="h-[500px]">
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
          {items.map((item) => {
            const detection = detectionResults[item.id];
            const isSelected = selectedItems.has(item.id);
            const hasAssignment = !!item.assigned_view;
            
            return (
              <div
                key={item.id}
                className={cn(
                  "relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                  isSelected 
                    ? "border-primary ring-2 ring-primary/20" 
                    : hasAssignment 
                    ? "border-transparent" 
                    : "border-amber-500/50",
                  "hover:border-primary/50"
                )}
                onClick={() => toggleItem(item.id)}
              >
                <div className="aspect-[3/4] bg-muted">
                  <OptimizedImage
                    src={item.source_url}
                    alt={item.view}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Checkbox overlay */}
                <div className="absolute top-1 left-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-background/80"
                  />
                </div>

                {/* View badge */}
                {item.assigned_view && (
                  <Badge 
                    className={cn(
                      "absolute top-1 right-1 text-[10px] px-1.5 py-0",
                      item.assigned_view === 'front' 
                        ? "bg-blue-500" 
                        : "bg-orange-500"
                    )}
                  >
                    {item.assigned_view === 'front' ? 'F' : 'B'}
                  </Badge>
                )}

                {/* Detection result overlay */}
                {detection && !item.assigned_view && (
                  <div 
                    className={cn(
                      "absolute inset-0 bg-gradient-to-t from-black/80 to-transparent",
                      "flex flex-col justify-end p-1.5"
                    )}
                  >
                    <Badge 
                      className={cn(
                        "text-[10px]",
                        detection.viewType === 'front' 
                          ? "bg-blue-500" 
                          : detection.viewType === 'back'
                          ? "bg-orange-500"
                          : "bg-muted"
                      )}
                    >
                      {detection.viewType} ({Math.round(detection.confidence * 100)}%)
                    </Badge>
                  </div>
                )}

                {/* Unassigned indicator */}
                {!item.assigned_view && !detection && (
                  <div className="absolute bottom-1 right-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                )}

                {/* Quick action buttons on hover */}
                <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetView('front', [item.id]);
                    }}
                  >
                    Front
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetView('back', [item.id]);
                    }}
                  >
                    Back
                  </Button>
                  {item.assigned_view && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-5 px-1 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearView([item.id]);
                      }}
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
