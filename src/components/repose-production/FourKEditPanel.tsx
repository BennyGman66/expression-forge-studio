import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Loader2, 
  Wand2, 
  Check, 
  X, 
  Clock, 
  RefreshCw,
  AlertTriangle,
  ImageIcon,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/imageUtils";

interface FourKEditPanelProps {
  batchId: string | undefined;
}

interface OutputItem {
  id: string;
  batch_item_id: string;
  shot_type: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
  look_id?: string;
  look_code?: string;
}

interface JobInfo {
  id: string;
  status: string;
  progress_done: number;
  progress_failed: number;
  progress_total: number;
}

const SHOT_TYPES = [
  { id: "FRONT_FULL", label: "Full Front" },
  { id: "FRONT_CROPPED", label: "Cropped Front" },
  { id: "DETAIL", label: "Detail" },
  { id: "BACK_FULL", label: "Back Full" },
];

export function FourKEditPanel({ batchId }: FourKEditPanelProps) {
  const [selectedShotTypes, setSelectedShotTypes] = useState<string[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [activeJob, setActiveJob] = useState<JobInfo | null>(null);
  const [stalledCount, setStalledCount] = useState(0);

  // Fetch recent 4K outputs for this batch
  const fetchOutputs = useCallback(async () => {
    if (!batchId) return;

    // Get outputs created in the last hour (likely from 4K re-renders)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from("repose_outputs")
      .select(`
        id,
        batch_item_id,
        shot_type,
        status,
        result_url,
        error_message,
        created_at,
        repose_batch_items!batch_item_id(look_id, look_code)
      `)
      .eq("batch_id", batchId)
      .gte("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Error fetching outputs:", error);
      return;
    }

    const enriched = (data || []).map((o: any) => ({
      ...o,
      look_id: o.repose_batch_items?.look_id,
      look_code: o.repose_batch_items?.look_code,
    }));

    setOutputs(enriched);

    // Count stalled outputs (running for > 2 minutes)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const stalled = enriched.filter(
      (o: OutputItem) => o.status === "running" && o.created_at < twoMinAgo
    ).length;
    setStalledCount(stalled);
  }, [batchId]);

  // Fetch active job
  const fetchActiveJob = useCallback(async () => {
    if (!batchId) return;

    const { data } = await supabase
      .from("pipeline_jobs")
      .select("id, status, progress_done, progress_failed, progress_total")
      .eq("type", "REPOSE_GENERATION")
      .ilike("origin_context", `%${batchId}%`)
      .in("status", ["RUNNING", "QUEUED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setActiveJob(data);
      setIsRendering(true);
    } else {
      setActiveJob(null);
      setIsRendering(false);
    }
  }, [batchId]);

  // Initial fetch and polling
  useEffect(() => {
    fetchOutputs();
    fetchActiveJob();

    const interval = setInterval(() => {
      fetchOutputs();
      fetchActiveJob();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchOutputs, fetchActiveJob]);

  // Realtime subscription for new outputs
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`4k-feed-${batchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "repose_outputs",
          filter: `batch_id=eq.${batchId}`,
        },
        (payload) => {
          console.log("[4K Feed] Realtime update:", payload.eventType);
          fetchOutputs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, fetchOutputs]);

  // Toggle shot type selection
  const toggleShotType = (shotType: string) => {
    setSelectedShotTypes((prev) =>
      prev.includes(shotType)
        ? prev.filter((t) => t !== shotType)
        : [...prev, shotType]
    );
  };

  // Start 4K re-render
  const handleStartRender = async () => {
    if (!batchId) return;

    if (selectedShotTypes.length === 0) {
      toast.error("Please select at least one shot type");
      return;
    }

    setIsRendering(true);
    toast.info("Queuing 4K re-renders...");

    try {
      const { data, error } = await supabase.functions.invoke("rerender-favorites-4k", {
        body: {
          batchId,
          shotTypes: selectedShotTypes,
          imageSize: "4K",
        },
      });

      if (error) throw error;

      toast.success(`Queued ${data.queuedCount} outputs for 4K rendering`);
      fetchActiveJob();
      fetchOutputs();
    } catch (error) {
      console.error("Error starting 4K render:", error);
      toast.error("Failed to start 4K rendering");
      setIsRendering(false);
    }
  };

  // Cancel active job
  const handleCancelJob = async () => {
    if (!activeJob) return;

    try {
      await supabase
        .from("pipeline_jobs")
        .update({ status: "CANCELED" })
        .eq("id", activeJob.id);

      toast.info("4K rendering cancelled");
      setIsRendering(false);
      setActiveJob(null);
    } catch (error) {
      console.error("Error cancelling job:", error);
      toast.error("Failed to cancel job");
    }
  };

  // Cleanup stalled outputs
  const handleCleanupStalled = async () => {
    if (!batchId) return;

    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    try {
      await supabase
        .from("repose_outputs")
        .update({ status: "failed", error_message: "Marked as stalled by user" })
        .eq("batch_id", batchId)
        .eq("status", "running")
        .lt("created_at", twoMinAgo);

      toast.success("Stalled outputs marked as failed");
      fetchOutputs();
    } catch (error) {
      console.error("Error cleaning up stalled:", error);
      toast.error("Failed to cleanup stalled outputs");
    }
  };

  // Compute stats
  const stats = useMemo(() => {
    const complete = outputs.filter((o) => o.status === "complete").length;
    const running = outputs.filter((o) => o.status === "running").length;
    const queued = outputs.filter((o) => o.status === "queued").length;
    const failed = outputs.filter((o) => o.status === "failed").length;
    return { complete, running, queued, failed, total: outputs.length };
  }, [outputs]);

  // Get completed outputs for display
  const completedOutputs = useMemo(
    () => outputs.filter((o) => o.status === "complete" && o.result_url),
    [outputs]
  );

  const runningOutputs = useMemo(
    () => outputs.filter((o) => o.status === "running" || o.status === "queued"),
    [outputs]
  );

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header with controls */}
      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              4K Re-render
            </CardTitle>
            
            {activeJob && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>
                    {activeJob.progress_done}/{activeJob.progress_total}
                  </span>
                  {activeJob.progress_failed > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {activeJob.progress_failed} failed
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={handleCancelJob}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Shot type selection */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Shot Types:</span>
              {SHOT_TYPES.map((type) => (
                <label
                  key={type.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedShotTypes.includes(type.id)}
                    onCheckedChange={() => toggleShotType(type.id)}
                    disabled={isRendering}
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              ))}
            </div>

            <div className="flex-1" />

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {stalledCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanupStalled}
                  className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Clean {stalledCount} Stalled
                </Button>
              )}
              
              <Button
                onClick={handleStartRender}
                disabled={isRendering || selectedShotTypes.length === 0}
                className="gap-2"
              >
                {isRendering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                Re-render @ 4K
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status bar */}
      {stats.total > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-muted/50">
          <Badge variant="outline" className="gap-1.5">
            <Check className="w-3 h-3 text-green-500" />
            {stats.complete} Complete
          </Badge>
          {stats.running > 0 && (
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              {stats.running} Generating
            </Badge>
          )}
          {stats.queued > 0 && (
            <Badge variant="outline" className="gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              {stats.queued} Queued
            </Badge>
          )}
          {stats.failed > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <X className="w-3 h-3" />
              {stats.failed} Failed
            </Badge>
          )}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchOutputs();
              fetchActiveJob();
            }}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      )}

      {/* Live generation feed */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          {outputs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No 4K renders yet</p>
              <p className="text-sm">Select shot types and click "Re-render @ 4K" to start</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {/* Queued/Running outputs first */}
              {runningOutputs.map((output) => (
                <OutputTile key={output.id} output={output} />
              ))}
              
              {/* Completed outputs */}
              {completedOutputs.map((output) => (
                <OutputTile key={output.id} output={output} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// Individual output tile component
function OutputTile({ output }: { output: OutputItem }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isComplete = output.status === "complete" && output.result_url;
  const isRunning = output.status === "running";
  const isQueued = output.status === "queued";
  const isFailed = output.status === "failed";

  // Check if stalled (running for > 2 minutes)
  const isStalled = isRunning && new Date(output.created_at) < new Date(Date.now() - 2 * 60 * 1000);

  const thumbnailUrl = output.result_url ? getImageUrl(output.result_url, "thumb") : null;

  return (
    <div
      className={cn(
        "relative aspect-[3/4] rounded-lg overflow-hidden border-2",
        "transition-all bg-muted/50",
        isComplete && "border-green-500/50",
        isRunning && !isStalled && "border-blue-500/50",
        isStalled && "border-amber-500/50",
        isQueued && "border-muted-foreground/30",
        isFailed && "border-destructive/50"
      )}
    >
      {/* Loading state */}
      {isComplete && isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Completed image */}
      {isComplete && thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt="4K output"
          className={cn(
            "w-full h-full object-cover transition-opacity",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}

      {/* Generating state */}
      {isRunning && !isStalled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="text-xs font-medium text-blue-500">Generating...</span>
        </div>
      )}

      {/* Stalled state */}
      {isStalled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <span className="text-xs font-medium text-amber-500">Stalled</span>
        </div>
      )}

      {/* Queued state */}
      {isQueued && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <Clock className="w-8 h-8 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Queued</span>
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <X className="w-8 h-8 text-destructive" />
          <span className="text-xs font-medium text-destructive">Failed</span>
          {output.error_message && (
            <span className="text-[10px] text-destructive/70 px-2 text-center line-clamp-2">
              {output.error_message}
            </span>
          )}
        </div>
      )}

      {/* 4K badge for completed */}
      {isComplete && (
        <Badge className="absolute top-1 right-1 bg-purple-600 text-white text-[10px] px-1.5 py-0.5">
          4K
        </Badge>
      )}

      {/* Shot type badge */}
      <Badge
        variant="secondary"
        className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 bg-background/80"
      >
        {output.shot_type?.replace("_", " ")}
      </Badge>

      {/* Look code if available */}
      {output.look_code && (
        <Badge
          variant="outline"
          className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 bg-background/80"
        >
          {output.look_code}
        </Badge>
      )}
    </div>
  );
}

export default FourKEditPanel;
