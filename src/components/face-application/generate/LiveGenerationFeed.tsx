import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/imageUtils";
import { VIEW_LABELS } from "@/types/face-application";
import { Check, X, Loader2, AlertTriangle, Clock, Trash2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface LiveOutput {
  id: string;
  stored_url: string | null;
  view: string;
  attempt_index: number | null;
  status: string | null;
  look_id: string | null;
  job_id?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  lookName?: string;
  isNew?: boolean;
  is_selected?: boolean | null;
}

interface LiveGenerationFeedProps {
  projectId: string;
  isGenerating: boolean;
  onCleanupStalled?: (stalledIds: string[]) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

const STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function LiveGenerationFeed({ 
  projectId, 
  isGenerating,
  onCleanupStalled,
  onSelectionChange
}: LiveGenerationFeedProps) {
  const [outputs, setOutputs] = useState<LiveOutput[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stalledCount, setStalledCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();

  // Toggle selection for an output
  const handleToggleSelect = async (outputId: string) => {
    const isCurrentlySelected = selectedIds.has(outputId);
    const newSelected = new Set(selectedIds);
    
    if (isCurrentlySelected) {
      newSelected.delete(outputId);
    } else {
      newSelected.add(outputId);
    }
    
    setSelectedIds(newSelected);
    onSelectionChange?.(newSelected);
    
    // Persist to database
    await supabase
      .from('ai_apply_outputs')
      .update({ is_selected: !isCurrentlySelected })
      .eq('id', outputId);
  };

  // Chunk helper to avoid Supabase .in() URL limit
  const CHUNK_SIZE = 30;
  const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

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

      // Chunk the job IDs to avoid URL size limits
      const jobIdChunks = chunkArray(jobIds, CHUNK_SIZE);
      const allOutputs: LiveOutput[] = [];

      for (const chunk of jobIdChunks) {
        const { data } = await supabase
          .from("ai_apply_outputs")
          .select(`
            id,
            stored_url,
            view,
            attempt_index,
            status,
            look_id,
            job_id,
            created_at,
            is_selected
          `)
          .in("job_id", chunk)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(100);

        if (data) {
          allOutputs.push(...data);
        }
      }

      if (allOutputs.length > 0) {
        // Sort all outputs by created_at descending and limit to 100
        allOutputs.sort((a, b) => 
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        const limitedOutputs = allOutputs.slice(0, 100);

        // Fetch look names (also chunked)
        const lookIds = [...new Set(limitedOutputs.map(d => d.look_id).filter(Boolean))] as string[];
        const lookIdChunks = chunkArray(lookIds, CHUNK_SIZE);
        const allLooks: { id: string; name: string }[] = [];

        for (const chunk of lookIdChunks) {
          const { data: looks } = await supabase
            .from("talent_looks")
            .select("id, name")
            .in("id", chunk);
          if (looks) allLooks.push(...looks);
        }

        const lookMap = new Map(allLooks.map(l => [l.id, l.name]));

        const enriched = limitedOutputs.map(o => ({
          ...o,
          lookName: o.look_id ? lookMap.get(o.look_id) : undefined,
        }));

        setOutputs(enriched);
        
        // Sync selection state from DB
        const dbSelected = new Set(
          enriched.filter(o => o.is_selected).map(o => o.id)
        );
        setSelectedIds(dbSelected);

        // Count stalled
        const now = Date.now();
        const stalled = enriched.filter(o => 
          o.status === "generating" && 
          o.created_at && 
          now - new Date(o.created_at).getTime() > STALL_THRESHOLD_MS
        );
        setStalledCount(stalled.length);
      } else {
        setOutputs([]);
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
    const stalledIds = outputs
      .filter(o => {
        const age = Date.now() - new Date(o.created_at).getTime();
        return o.status === 'generating' && age > 120000;
      })
      .map(o => o.id);

    if (stalledIds.length === 0) return;

    await supabase
      .from('ai_apply_outputs')
      .update({ status: 'failed', error_message: 'Timed out' })
      .in('id', stalledIds);

    onCleanupStalled?.(stalledIds);
  };

  const handleCancelAll = async () => {
    setIsCanceling(true);
    try {
      // Cancel all pending/running jobs for this project
      const { error } = await supabase
        .from('ai_apply_jobs')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('project_id', projectId)
        .in('status', ['pending', 'running']);

      if (error) throw error;

      // Mark any generating outputs as failed
      await supabase
        .from('ai_apply_outputs')
        .update({ status: 'failed', error_message: 'Canceled by user' })
        .in('job_id', outputs.filter(o => o.status === 'generating').map(o => o.job_id));

      toast({ title: 'Canceled all pending jobs' });
    } catch (err) {
      console.error('Failed to cancel:', err);
      toast({ title: 'Failed to cancel', variant: 'destructive' });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleClearFeed = async () => {
    setIsClearing(true);
    try {
      // Get all job IDs for this project
      const { data: jobs } = await supabase
        .from('ai_apply_jobs')
        .select('id')
        .eq('project_id', projectId);

      if (jobs && jobs.length > 0) {
        const jobIds = jobs.map(j => j.id);
        const jobIdChunks = chunkArray(jobIds, CHUNK_SIZE);
        
        // Delete all outputs for these jobs (chunked)
        for (const chunk of jobIdChunks) {
          const { error } = await supabase
            .from('ai_apply_outputs')
            .delete()
            .in('job_id', chunk);

          if (error) throw error;
        }
      }

      setOutputs([]);
      toast({ title: 'Cleared feed' });
    } catch (err) {
      console.error('Failed to clear:', err);
      toast({ title: 'Failed to clear feed', variant: 'destructive' });
    } finally {
      setIsClearing(false);
    }
  };

  const completedCount = outputs.filter(o => o.status === "completed").length;
  const generatingCount = outputs.filter(o => o.status === "generating").length;
  const failedCount = outputs.filter(o => o.status === "failed").length;

  const displayOutputs = showAll ? outputs : outputs.slice(0, 24);

  if (outputs.length === 0 && !isGenerating) {
    return null;
  }

  const hasPendingOrRunning = generatingCount > 0;
  const hasAnyOutputs = outputs.length > 0;

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
            {/* Cancel button */}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={handleCancelAll}
              disabled={isCanceling || !hasPendingOrRunning}
            >
              {isCanceling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Square className="h-3 w-3" />
              )}
              Cancel
            </Button>
            
            {/* Clear button */}
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={handleClearFeed}
              disabled={isClearing || !hasAnyOutputs}
            >
              {isClearing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              Clear
            </Button>

            {selectedIds.size > 0 && (
              <Badge variant="default" className="gap-1 bg-primary">
                <Check className="w-3 h-3" />
                {selectedIds.size} selected
              </Badge>
            )}
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
              isSelected={selectedIds.has(output.id)}
              onToggleSelect={handleToggleSelect}
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

interface OutputThumbnailProps {
  output: LiveOutput;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

function OutputThumbnail({ output, isSelected, onToggleSelect }: OutputThumbnailProps) {
  const isCompleted = output.status === "completed";
  const isGenerating = output.status === "generating";
  const isFailed = output.status === "failed";
  const isPending = output.status === "pending";

  // Check if stalled
  const isStalled = isGenerating && output.created_at && 
    Date.now() - new Date(output.created_at).getTime() > STALL_THRESHOLD_MS;

  const canSelect = isCompleted && output.stored_url;

  const handleClick = () => {
    if (canSelect) {
      onToggleSelect(output.id);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "relative group w-16 h-16 rounded-lg overflow-hidden border transition-all duration-300",
        canSelect && "cursor-pointer hover:scale-105",
        output.isNew && "animate-in zoom-in-90 fade-in duration-500",
        isSelected && "ring-2 ring-primary ring-offset-1 border-primary",
        !isSelected && isCompleted && "border-green-500/50",
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

      {/* Selection checkmark overlay */}
      {isSelected && (
        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-primary-foreground" />
        </div>
      )}

      {/* Status badge */}
      <div className={cn(
        "absolute inset-x-0 bottom-0 py-0.5 text-[9px] text-center font-medium truncate",
        isSelected && "bg-primary text-primary-foreground",
        !isSelected && isCompleted && "bg-green-500/80 text-white",
        isGenerating && !isStalled && "bg-blue-500/80 text-white",
        isStalled && "bg-amber-500/80 text-white",
        isFailed && "bg-red-500/80 text-white",
        isPending && "bg-muted text-muted-foreground"
      )}>
        {VIEW_LABELS[output.view] || output.view}
      </div>

      {/* Hover tooltip */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px] p-1 pointer-events-none">
        <span className="truncate max-w-full">{output.lookName || 'Unknown'}</span>
        <span>#{(output.attempt_index ?? 0) + 1}</span>
        {isStalled && <span className="text-amber-300">Stalled</span>}
        {canSelect && <span className="text-primary-foreground">{isSelected ? '✓ Selected' : 'Click to select'}</span>}
      </div>
    </div>
  );
}
