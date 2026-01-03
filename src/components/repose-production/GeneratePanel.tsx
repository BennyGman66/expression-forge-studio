import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Play, Square, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs, useUpdateReposeBatchStatus } from "@/hooks/useReposeBatches";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import type { ReposeConfig } from "@/types/repose";

interface GeneratePanelProps {
  batchId: string | undefined;
}

export function GeneratePanel({ batchId }: GeneratePanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const updateStatus = useUpdateReposeBatchStatus();

  const [isGenerating, setIsGenerating] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);

  // Subscribe to realtime updates for outputs
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`repose-outputs-${batchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'repose_outputs',
          filter: `batch_id=eq.${batchId}`,
        },
        () => {
          refetchOutputs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, refetchOutputs]);

  // Track generation based on batch status
  useEffect(() => {
    if (batch?.status === 'RUNNING') {
      setIsGenerating(true);
    } else {
      setIsGenerating(false);
    }
  }, [batch?.status]);

  const completedCount = outputs?.filter(o => o.status === 'complete').length || 0;
  const failedCount = outputs?.filter(o => o.status === 'failed').length || 0;
  const queuedCount = outputs?.filter(o => o.status === 'queued').length || 0;
  const runningCount = outputs?.filter(o => o.status === 'running').length || 0;
  const totalCount = outputs?.length || 0;

  const progressPercent = totalCount > 0 ? ((completedCount + failedCount) / totalCount) * 100 : 0;

  const handleStartGeneration = async () => {
    if (!batchId || !batch) return;

    setShouldStop(false);
    setIsGenerating(true);

    // Update batch status to RUNNING
    updateStatus.mutate({ batchId, status: 'RUNNING' });

    // TODO: Implement actual generation logic
    // This would involve:
    // 1. Loading clay poses for the selected brand
    // 2. Creating repose_outputs for each batch_item + pose combination
    // 3. Calling an edge function for each output
    // For now, just show a placeholder
    
    toast.info("Generation logic will be implemented in the next phase");
    
    // Simulate completion for now
    setTimeout(() => {
      updateStatus.mutate({ batchId, status: 'COMPLETE' });
      setIsGenerating(false);
    }, 2000);
  };

  const handleStopGeneration = () => {
    setShouldStop(true);
    if (batchId) {
      updateStatus.mutate({ batchId, status: 'FAILED' });
    }
    setIsGenerating(false);
    toast.info("Generation stopped");
  };

  if (batchLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No batch selected. Please select a job and configure the batch first.</p>
      </div>
    );
  }

  if (!batch.brand_id) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>Please select a brand pose library in Batch Setup before generating.</p>
      </div>
    );
  }

  const config = batch.config_json as ReposeConfig;

  return (
    <div className="space-y-6">
      {/* Config Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Generation Configuration
          </CardTitle>
          <CardDescription>
            Current batch settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Batch Items</p>
              <p className="text-xl font-bold">{batchItems?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Poses Per Slot</p>
              <p className="text-xl font-bold">{config?.randomPosesPerSlot || 2}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attempts Per Pose</p>
              <p className="text-xl font-bold">{config?.attemptsPerPose || 1}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant={batch.status === 'RUNNING' ? 'default' : 'secondary'}>
                {batch.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Progress</span>
              <span>{completedCount + failedCount} / {totalCount || '?'}</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <span className="text-xs">Queued</span>
              </div>
              <p className="text-xl font-bold">{queuedCount}</p>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-blue-500 mb-1">
                <span className="text-xs">Running</span>
              </div>
              <p className="text-xl font-bold text-blue-500">{runningCount}</p>
            </div>
            <div className="text-center p-3 bg-green-500/10 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-green-500 mb-1">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-xs">Complete</span>
              </div>
              <p className="text-xl font-bold text-green-500">{completedCount}</p>
            </div>
            <div className="text-center p-3 bg-red-500/10 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-red-500 mb-1">
                <XCircle className="w-3 h-3" />
                <span className="text-xs">Failed</span>
              </div>
              <p className="text-xl font-bold text-red-500">{failedCount}</p>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            {!isGenerating ? (
              <Button 
                onClick={handleStartGeneration}
                size="lg"
                className="gap-2"
                disabled={batch.status === 'COMPLETE'}
              >
                <Play className="w-4 h-4" />
                {batch.status === 'COMPLETE' ? 'Generation Complete' : 'Start Generation'}
              </Button>
            ) : (
              <Button 
                onClick={handleStopGeneration}
                size="lg"
                variant="destructive"
                className="gap-2"
              >
                <Square className="w-4 h-4" />
                Stop Generation
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
