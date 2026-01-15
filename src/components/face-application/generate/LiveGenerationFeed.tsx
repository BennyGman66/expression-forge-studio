import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/imageUtils";
import { VIEW_LABELS } from "@/types/face-application";
import { Check, X, Loader2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LiveOutput {
  id: string;
  stored_url: string | null;
  view: string;
  attempt_index: number | null;
  status: string | null;
  look_id: string | null;
  created_at: string | null;
  updated_at?: string | null;
  lookName?: string;
  isNew?: boolean;
}

interface LiveGenerationFeedProps {
  projectId: string;
  isGenerating: boolean;
  onCleanupStalled?: (stalledIds: string[]) => void;
}

const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function LiveGenerationFeed({ 
  projectId, 
  isGenerating,
  onCleanupStalled 
}: LiveGenerationFeedProps) {
  const [outputs, setOutputs] = useState<LiveOutput[]>([]);
  const [stalledCount, setStalledCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);

  // Fetch recent outputs for this project
  useEffect(() => {
    if (!projectId) return;

    const fetchOutputs = async () => {
      // Get outputs from the last 24 hours
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: jobs } = await supabase
        .from("ai_apply_jobs")
        .select("id")
        .eq("project_id", projectId);

      if (!jobs || jobs.length === 0) {
        setOutputs([]);
        return;
      }

      const jobIds = jobs.map(j => j.id);

      const { data } = await supabase
        .from("ai_apply_outputs")
        .select(`
          id,
          stored_url,
          view,
          attempt_index,
          status,
          look_id,
          created_at
        `)
        .in("job_id", jobIds)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) {
        // Fetch look names
        const lookIds = [...new Set(data.map(d => d.look_id).filter(Boolean))] as string[];
        const { data: looks } = await supabase
          .from("talent_looks")
          .select("id, name")
          .in("id", lookIds);

        const lookMap = new Map(looks?.map(l => [l.id, l.name]) || []);

        const enriched = data.map(o => ({
          ...o,
          lookName: o.look_id ? lookMap.get(o.look_id) : undefined,
        }));

        setOutputs(enriched);

        // Count stalled
        const now = Date.now();
        const stalled = enriched.filter(o => 
          o.status === "generating" && 
          o.created_at && 
          now - new Date(o.created_at).getTime() > STALL_THRESHOLD_MS
        );
        setStalledCount(stalled.length);
      }
    };

    fetchOutputs();
    const interval = setInterval(fetchOutputs, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Real-time subscription for new outputs
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`live-feed-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_apply_outputs',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOutput = payload.new as LiveOutput;
            setOutputs(prev => {
              // Add isNew flag for animation
              const withFlag = { ...newOutput, isNew: true };
              return [withFlag, ...prev.filter(o => o.id !== newOutput.id)].slice(0, 100);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as LiveOutput;
            setOutputs(prev => 
              prev.map(o => o.id === updated.id ? { ...updated, isNew: o.isNew } : o)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Clean up stalled outputs
  const handleCleanupStalled = async () => {
    const now = Date.now();
    const stalledIds = outputs
      .filter(o => 
        o.status === "generating" && 
        o.created_at && 
        now - new Date(o.created_at).getTime() > STALL_THRESHOLD_MS
      )
      .map(o => o.id);

    if (stalledIds.length === 0) return;

    await supabase
      .from("ai_apply_outputs")
      .update({ status: "failed", error_message: "Stalled - marked as failed by user" })
      .in("id", stalledIds);

    onCleanupStalled?.(stalledIds);
  };

  const completedCount = outputs.filter(o => o.status === "completed").length;
  const generatingCount = outputs.filter(o => o.status === "generating").length;
  const failedCount = outputs.filter(o => o.status === "failed").length;

  const displayOutputs = showAll ? outputs : outputs.slice(0, 24);

  if (outputs.length === 0 && !isGenerating) {
    return null;
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="py-3 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            🎬 Live Generation Feed
            {isGenerating && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              <Check className="w-3 h-3 text-green-500" />
              {completedCount}
            </Badge>
            {generatingCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                {generatingCount}
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <X className="w-3 h-3 text-red-500" />
                {failedCount}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3">
        {/* Stalled warning */}
        {stalledCount > 0 && (
          <div className="flex items-center justify-between mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{stalledCount} outputs stalled for 5+ minutes</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs"
              onClick={handleCleanupStalled}
            >
              Mark as Failed
            </Button>
          </div>
        )}

        {/* Image grid */}
        <div 
          ref={containerRef}
          className="flex flex-wrap gap-2"
        >
          {displayOutputs.map((output) => (
            <OutputThumbnail 
              key={output.id} 
              output={output} 
            />
          ))}
        </div>

        {/* Show more */}
        {outputs.length > 24 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 text-xs"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show Less" : `Show All (${outputs.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function OutputThumbnail({ output }: { output: LiveOutput }) {
  const isCompleted = output.status === "completed";
  const isGenerating = output.status === "generating";
  const isFailed = output.status === "failed";
  const isPending = output.status === "pending";

  // Check if stalled
  const isStalled = isGenerating && output.created_at && 
    Date.now() - new Date(output.created_at).getTime() > STALL_THRESHOLD_MS;

  return (
    <div 
      className={cn(
        "relative group w-16 h-16 rounded-lg overflow-hidden border transition-all duration-300",
        output.isNew && "animate-in zoom-in-90 fade-in duration-500",
        isCompleted && "border-green-500/50",
        isGenerating && !isStalled && "border-blue-500/50",
        isStalled && "border-amber-500",
        isFailed && "border-red-500/50",
        isPending && "border-muted"
      )}
    >
      {isCompleted && output.stored_url ? (
        <img
          src={getImageUrl(output.stored_url, 'tiny')}
          alt={`${output.view} #${(output.attempt_index ?? 0) + 1}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className={cn(
          "w-full h-full flex items-center justify-center",
          isPending && "bg-muted",
          isGenerating && !isStalled && "bg-blue-50 dark:bg-blue-950/20",
          isStalled && "bg-amber-50 dark:bg-amber-950/20",
          isFailed && "bg-red-50 dark:bg-red-950/20"
        )}>
          {isGenerating && !isStalled && (
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          )}
          {isStalled && (
            <Clock className="w-5 h-5 text-amber-500" />
          )}
          {isFailed && (
            <X className="w-5 h-5 text-red-500" />
          )}
          {isPending && (
            <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
          )}
        </div>
      )}

      {/* Status badge */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 py-0.5 text-[9px] text-center font-medium truncate",
        isCompleted && "bg-green-500/80 text-white",
        isGenerating && !isStalled && "bg-blue-500/80 text-white",
        isStalled && "bg-amber-500/80 text-white",
        isFailed && "bg-red-500/80 text-white",
        isPending && "bg-muted text-muted-foreground"
      )}>
        {VIEW_LABELS[output.view] || output.view}
      </div>

      {/* Hover tooltip */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px] p-1">
        <span className="truncate max-w-full">{output.lookName || 'Unknown'}</span>
        <span>#{(output.attempt_index ?? 0) + 1}</span>
        {isStalled && <span className="text-amber-300">Stalled</span>}
      </div>
    </div>
  );
}
