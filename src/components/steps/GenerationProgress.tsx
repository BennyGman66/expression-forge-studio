import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle, Image as ImageIcon, X, Square, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface Job {
  id: string;
  status: string;
  progress: number | null;
  total: number | null;
  logs: Json;
  result: Json;
  created_at: string;
  updated_at: string;
}

interface Output {
  id: string;
  image_url: string | null;
  status: string;
  prompt_used: string | null;
  created_at: string;
}

interface GenerationProgressProps {
  projectId: string;
  onClose?: () => void;
}

const STALL_THRESHOLD_MS = 90000; // 90 seconds without progress = stalled

export function GenerationProgress({ projectId, onClose }: GenerationProgressProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const lastProgressRef = useRef<{ progress: number; time: number } | null>(null);

  const handleStopGeneration = async () => {
    const activeJob = jobs.find((j) => j.status === "running");
    if (!activeJob) return;
    
    setIsStopping(true);
    try {
      await supabase
        .from("jobs")
        .update({ 
          status: "stopped",
          result: { 
            generated: activeJob.progress || 0, 
            total: activeJob.total || 0,
            stopped_by_user: true 
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", activeJob.id);
      toast.success("Generation stopped. Already generated images are kept.");
      setIsStalled(false);
    } catch (err) {
      toast.error("Failed to stop generation");
    } finally {
      setIsStopping(false);
    }
  };

  const handleMarkStalled = async () => {
    const activeJob = jobs.find((j) => j.status === "running");
    if (!activeJob) return;
    
    await supabase
      .from("jobs")
      .update({ 
        status: "stalled",
        result: { 
          generated: activeJob.progress || 0, 
          total: activeJob.total || 0,
          stalled: true 
        },
        updated_at: new Date().toISOString()
      })
      .eq("id", activeJob.id);
    
    toast.info("Job marked as stalled. Click 'Generate Images' to resume.");
    setIsStalled(false);
  };

  // Fetch initial data and subscribe to updates
  useEffect(() => {
    // Fetch recent jobs
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .eq("project_id", projectId)
        .eq("type", "generate")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (data) setJobs(data);
    };

    // Fetch recent outputs
    const fetchOutputs = async () => {
      const { data } = await supabase
        .from("outputs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (data) setOutputs(data);
    };

    fetchJobs();
    fetchOutputs();

    // Auto-refresh polling every 3 seconds for reliable updates
    const pollInterval = setInterval(() => {
      fetchJobs();
      fetchOutputs();
    }, 3000);

    // Subscribe to job updates with unique channel name
    const jobChannel = supabase
      .channel(`job-updates-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log("Job update received:", payload);
          if (payload.eventType === "INSERT") {
            setJobs((prev) => [payload.new as Job, ...prev].slice(0, 5));
          } else if (payload.eventType === "UPDATE") {
            setJobs((prev) =>
              prev.map((j) => (j.id === payload.new.id ? (payload.new as Job) : j))
            );
          }
          // Refetch to ensure we have latest data
          fetchJobs();
        }
      )
      .subscribe();

    // Subscribe to output updates
    const outputChannel = supabase
      .channel("output-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "outputs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setOutputs((prev) => [payload.new as Output, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(jobChannel);
      supabase.removeChannel(outputChannel);
    };
  }, [projectId]);

  // Stall detection
  useEffect(() => {
    const activeJob = jobs.find((j) => j.status === "running");
    if (!activeJob) {
      lastProgressRef.current = null;
      setIsStalled(false);
      return;
    }

    const currentProgress = activeJob.progress || 0;
    const now = Date.now();

    if (!lastProgressRef.current) {
      lastProgressRef.current = { progress: currentProgress, time: now };
    } else if (currentProgress !== lastProgressRef.current.progress) {
      // Progress changed, reset timer
      lastProgressRef.current = { progress: currentProgress, time: now };
      setIsStalled(false);
    } else {
      // Check if stalled
      const elapsed = now - lastProgressRef.current.time;
      if (elapsed > STALL_THRESHOLD_MS) {
        setIsStalled(true);
      }
    }
  }, [jobs]);

  // Timer to check for stalls every 10 seconds
  useEffect(() => {
    const stallCheckInterval = setInterval(() => {
      const activeJob = jobs.find((j) => j.status === "running");
      if (activeJob && lastProgressRef.current) {
        const elapsed = Date.now() - lastProgressRef.current.time;
        if (elapsed > STALL_THRESHOLD_MS) {
          setIsStalled(true);
        }
      }
    }, 10000);

    return () => clearInterval(stallCheckInterval);
  }, [jobs]);

  const activeJob = jobs.find((j) => j.status === "running");
  const completedOutputs = outputs.filter((o) => o.status === "completed" && o.image_url);

  return (
    <div className="space-y-6">
      {/* Active Job Progress */}
      {activeJob && (
        <div className={cn(
          "p-4 rounded-lg border",
          isStalled 
            ? "border-amber-500/50 bg-amber-500/10" 
            : "border-primary/50 bg-primary/5 animate-pulse-glow"
        )}>
          <div className="flex items-center gap-3 mb-3">
            {isStalled ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            )}
            <div className="flex-1">
              <p className="font-medium">
                {isStalled ? "Generation appears stuck" : "Generating images..."}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeJob.progress || 0} / {activeJob.total || 0} complete
                {isStalled && " • No progress for 90+ seconds"}
              </p>
            </div>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Progress 
            value={((activeJob.progress || 0) / (activeJob.total || 1)) * 100} 
            className="h-2"
          />
          {Array.isArray(activeJob.logs) && activeJob.logs.length > 0 && (
            <div className="mt-3 max-h-24 overflow-y-auto text-xs font-mono text-muted-foreground bg-muted/50 rounded p-2">
              {(activeJob.logs as string[]).slice(-5).map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          )}
          
          {/* Stalled Warning and Actions */}
          {isStalled && (
            <div className="mt-4 p-3 rounded-md bg-amber-500/20 border border-amber-500/30">
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                The generation seems to have stopped responding. You can mark it as stalled and restart, 
                or wait a bit longer.
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleMarkStalled}
                  className="flex-1 gap-2 bg-amber-600 hover:bg-amber-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Mark Stalled & Restart
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    lastProgressRef.current = { progress: activeJob.progress || 0, time: Date.now() };
                    setIsStalled(false);
                  }}
                  className="gap-2"
                >
                  Wait Longer
                </Button>
              </div>
            </div>
          )}
          
          {/* Stop Control - only show when not stalled */}
          {!isStalled && (
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleStopGeneration}
                disabled={isStopping}
                className="w-full gap-2 border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                <Square className="w-3.5 h-3.5" />
                {isStopping ? "Stopping..." : "Stop & Keep Generated"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recent Jobs Summary */}
      {!activeJob && jobs.length > 0 && (
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center gap-2 text-sm">
            {jobs[0].status === "completed" ? (
              <>
                <CheckCircle className="w-4 h-4 text-primary" />
                <span className="font-medium">Generation completed</span>
                {jobs[0].result && typeof jobs[0].result === 'object' && 'generated' in jobs[0].result && (
                  <span className="text-muted-foreground">
                    ({(jobs[0].result as { generated: number; total: number }).generated}/
                    {(jobs[0].result as { generated: number; total: number }).total} images)
                  </span>
                )}
              </>
            ) : jobs[0].status === "stopped" ? (
              <>
                <Square className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">Generation stopped</span>
                {jobs[0].result && typeof jobs[0].result === 'object' && 'generated' in jobs[0].result && (
                  <span className="text-muted-foreground">
                    ({(jobs[0].result as { generated: number; total: number }).generated}/
                    {(jobs[0].result as { generated: number; total: number }).total} images generated)
                  </span>
                )}
              </>
            ) : jobs[0].status === "stalled" ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="font-medium">Generation stalled</span>
                {jobs[0].result && typeof jobs[0].result === 'object' && 'generated' in jobs[0].result && (
                  <span className="text-muted-foreground">
                    ({(jobs[0].result as { generated: number; total: number }).generated}/
                    {(jobs[0].result as { generated: number; total: number }).total} images generated)
                  </span>
                )}
              </>
            ) : jobs[0].status === "failed" ? (
              <>
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="font-medium">Generation failed</span>
              </>
            ) : null}
          </div>
          {(jobs[0].status === "stopped" || jobs[0].status === "stalled") && jobs[0].result && typeof jobs[0].result === 'object' && 'total' in jobs[0].result && (
            <p className="text-xs text-muted-foreground mt-2">
              Click "Generate Images" to resume — existing images will be skipped automatically.
            </p>
          )}
        </div>
      )}

      {/* Generated Images Gallery */}
      {completedOutputs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Generated Images ({completedOutputs.length})
          </h3>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {completedOutputs.map((output) => (
              <div
                key={output.id}
                className={cn(
                  "aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105",
                  selectedImage === output.id ? "border-primary" : "border-transparent"
                )}
                onClick={() => setSelectedImage(output.id === selectedImage ? null : output.id)}
              >
                <img
                  src={output.image_url!}
                  alt="Generated"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0"
              onClick={() => setSelectedImage(null)}
            >
              <X className="w-5 h-5" />
            </Button>
            <img
              src={completedOutputs.find((o) => o.id === selectedImage)?.image_url || ""}
              alt="Generated preview"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {completedOutputs.length === 0 && !activeJob && (
        <div className="text-center py-8 text-muted-foreground">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No generated images yet</p>
          <p className="text-sm">Select models and recipes, then click Generate</p>
        </div>
      )}
    </div>
  );
}
