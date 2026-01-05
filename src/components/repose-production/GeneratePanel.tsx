import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Play, Square, AlertCircle, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs, useUpdateReposeBatchStatus, useUpdateReposeBatchConfig } from "@/hooks/useReposeBatches";
import { usePipelineJobs } from "@/hooks/usePipelineJobs";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import type { ReposeConfig } from "@/types/repose";
import { REPOSE_MODEL_OPTIONS, DEFAULT_REPOSE_MODEL } from "@/types/repose";
import { 
  OutputShotType, 
  parseViewToInputType,
  getAllowedOutputsForInput,
  shotTypeToSlot,
  OUTPUT_SHOT_LABELS,
} from "@/types/shot-types";

interface GeneratePanelProps {
  batchId: string | undefined;
}

export function GeneratePanel({ batchId }: GeneratePanelProps) {
  const { data: batch, isLoading: batchLoading, refetch: refetchBatch } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const updateStatus = useUpdateReposeBatchStatus();
  const updateConfig = useUpdateReposeBatchConfig();
  const { createJob, updateProgress, setStatus } = usePipelineJobs();

  const [isGenerating, setIsGenerating] = useState(false);
  const shouldStopRef = useRef(false);
  const pipelineJobIdRef = useRef<string | null>(null);

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

  const config = batch?.config_json as ReposeConfig | undefined;
  const selectedModel = config?.model || DEFAULT_REPOSE_MODEL;

  const handleModelChange = (model: string) => {
    if (!batchId) return;
    const newConfig = { ...config, model };
    updateConfig.mutate({ batchId, config: newConfig }, {
      onSuccess: () => {
        const modelLabel = REPOSE_MODEL_OPTIONS.find(o => o.value === model)?.label;
        toast.success(`Model changed to ${modelLabel}`);
        refetchBatch();
      }
    });
  };

  const handleStartGeneration = async () => {
    if (!batchId || !batch || !batchItems?.length) return;

    shouldStopRef.current = false;
    setIsGenerating(true);

    const posesPerShotType = config?.posesPerShotType || 2;
    const attemptsPerPose = config?.attemptsPerPose || 1;
    const model = config?.model || DEFAULT_REPOSE_MODEL;

    try {
      // Update batch status to RUNNING
      updateStatus.mutate({ batchId, status: 'RUNNING' });

      // Step 1: Check if outputs already exist (resume case)
      const { data: existingOutputs } = await supabase
        .from('repose_outputs')
        .select('id, status')
        .eq('batch_id', batchId);

      let totalOutputs = existingOutputs?.length || 0;

      if (!existingOutputs?.length) {
        // Step 2: Fetch clay poses for the brand via product_images join
        console.log('Fetching clay poses for brand:', batch.brand_id);
        const { data: productImages, error: posesError } = await supabase
          .from('product_images')
          .select(`
            id,
            slot,
            shot_type,
            products!inner(brand_id),
            clay_images(id, stored_url)
          `)
          .eq('products.brand_id', batch.brand_id);

        if (posesError) {
          console.error('Error fetching poses:', posesError);
          throw posesError;
        }

        // Group poses by shot type (with fallback to slot mapping)
        const posesByShotType: Record<OutputShotType, Array<{ id: string; url: string }>> = {
          FRONT_FULL: [],
          FRONT_CROPPED: [],
          DETAIL: [],
          BACK_FULL: [],
        };

        productImages?.forEach((pi) => {
          // Prefer shot_type, fall back to slot mapping
          let shotType: OutputShotType | null = pi.shot_type as OutputShotType;
          if (!shotType && pi.slot) {
            const slotMap: Record<string, OutputShotType> = {
              'A': 'FRONT_FULL',
              'B': 'FRONT_CROPPED',
              'C': 'BACK_FULL',
              'D': 'DETAIL',
            };
            shotType = slotMap[pi.slot];
          }

          if (shotType && posesByShotType[shotType] && pi.clay_images) {
            const clayImages = Array.isArray(pi.clay_images) ? pi.clay_images : [pi.clay_images];
            clayImages.forEach((ci: { id: string; stored_url: string }) => {
              if (ci?.id && ci?.stored_url) {
                posesByShotType[shotType!].push({ id: ci.id, url: ci.stored_url });
              }
            });
          }
        });

        console.log('Poses by shot type:', Object.entries(posesByShotType).map(([k, v]) => `${k}: ${v.length}`).join(', '));

        // Step 3: Create repose_outputs for each batch_item based on enforced camera rules
        const outputsToCreate: Array<{
          batch_id: string;
          batch_item_id: string;
          pose_id: string | null;
          pose_url: string;
          slot: string; // Legacy field
          shot_type: OutputShotType;
          attempt_index: number;
          status: string;
        }> = [];

        for (const item of batchItems) {
          const inputType = parseViewToInputType(item.view);
          if (!inputType) continue;

          // Get allowed output shot types for this input (enforced camera rules)
          const allowedOutputs = getAllowedOutputsForInput(inputType);

          for (const shotType of allowedOutputs) {
            const posesInType = posesByShotType[shotType] || [];
            // Randomly select poses for this shot type
            const shuffled = [...posesInType].sort(() => Math.random() - 0.5);
            const selectedPoses = shuffled.slice(0, posesPerShotType);

            for (const pose of selectedPoses) {
              for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
                outputsToCreate.push({
                  batch_id: batchId,
                  batch_item_id: item.id,
                  pose_id: pose.id,
                  pose_url: pose.url,
                  slot: shotTypeToSlot(shotType), // Legacy field
                  shot_type: shotType,
                  attempt_index: attempt,
                  status: 'queued',
                });
              }
            }
          }
        }

        if (outputsToCreate.length === 0) {
          toast.error('No outputs to generate. Check available inputs and poses.');
          updateStatus.mutate({ batchId, status: 'DRAFT' });
          setIsGenerating(false);
          return;
        }

        console.log(`Creating ${outputsToCreate.length} output records`);
        const { error: insertError } = await supabase
          .from('repose_outputs')
          .insert(outputsToCreate);

        if (insertError) throw insertError;
        toast.success(`Created ${outputsToCreate.length} output tasks`);
        totalOutputs = outputsToCreate.length;
        await refetchOutputs();
      }

      // Create pipeline job for tracking
      const pipelineJobId = await createJob({
        type: 'REPOSE_GENERATION',
        title: `Repose: ${batch.job_id?.slice(0, 8) || 'Batch'}`,
        total: totalOutputs,
        origin_route: `/repose-production/batch/${batchId}?tab=generate`,
        origin_context: { batchId },
        supports_pause: true,
        supports_retry: false,
        supports_restart: false,
      });
      pipelineJobIdRef.current = pipelineJobId;

      // Step 4: Process queued outputs
      await processQueuedOutputs(pipelineJobId, model);

    } catch (error) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updateStatus.mutate({ batchId, status: 'FAILED' });
      if (pipelineJobIdRef.current) {
        setStatus(pipelineJobIdRef.current, 'FAILED');
      }
      setIsGenerating(false);
    }
  };

  const processQueuedOutputs = async (pipelineJobId: string, model: string) => {
    if (!batchId) return;

    // Get all queued outputs
    const { data: queuedOutputs } = await supabase
      .from('repose_outputs')
      .select('id')
      .eq('batch_id', batchId)
      .eq('status', 'queued')
      .order('created_at', { ascending: true });

    if (!queuedOutputs?.length) {
      // Check if all done
      const { data: remaining } = await supabase
        .from('repose_outputs')
        .select('id')
        .eq('batch_id', batchId)
        .in('status', ['queued', 'running']);

      if (!remaining?.length) {
        updateStatus.mutate({ batchId, status: 'COMPLETE' });
        setStatus(pipelineJobId, 'COMPLETED');
        toast.success('Generation complete!');
      }
      setIsGenerating(false);
      return;
    }

    console.log(`Processing ${queuedOutputs.length} queued outputs`);
    let processedCount = 0;
    let failedCountLocal = 0;

    for (const output of queuedOutputs) {
      if (shouldStopRef.current) {
        console.log('Generation stopped by user');
        updateProgress(pipelineJobId, { message: 'Paused by user' });
        setStatus(pipelineJobId, 'PAUSED');
        break;
      }

      try {
        const { error } = await supabase.functions.invoke('generate-repose-single', {
          body: { outputId: output.id, model },
        });

        if (error) {
          console.error(`Failed to process output ${output.id}:`, error);
          failedCountLocal++;
        } else {
          processedCount++;
        }

        // Update pipeline job progress
        await updateProgress(pipelineJobId, { 
          doneDelta: 1,
          failedDelta: error ? 1 : 0,
          message: `Processing ${processedCount + failedCountLocal}/${queuedOutputs.length}`,
        });

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`Error processing output ${output.id}:`, err);
        failedCountLocal++;
        await updateProgress(pipelineJobId, { failedDelta: 1 });
      }
    }

    // Refresh and check completion
    await refetchOutputs();
    
    if (!shouldStopRef.current) {
      const { data: remaining } = await supabase
        .from('repose_outputs')
        .select('id')
        .eq('batch_id', batchId)
        .in('status', ['queued', 'running']);

      if (!remaining?.length) {
        updateStatus.mutate({ batchId, status: 'COMPLETE' });
        setStatus(pipelineJobId, 'COMPLETED');
        toast.success('Generation complete!');
      }
    }
    
    setIsGenerating(false);
  };

  const handleStopGeneration = () => {
    shouldStopRef.current = true;
    // Immediately update batch status
    if (batchId) {
      updateStatus.mutate({ batchId, status: 'DRAFT' });
    }
    // Update pipeline job status if we have one
    if (pipelineJobIdRef.current) {
      setStatus(pipelineJobIdRef.current, 'PAUSED');
    }
    setIsGenerating(false);
    toast.info("Generation stopped");
  };

  const handleClearOutputs = async () => {
    if (!batchId) return;
    
    const confirmed = window.confirm('Are you sure you want to delete all generated outputs? This cannot be undone.');
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('repose_outputs')
        .delete()
        .eq('batch_id', batchId);

      if (error) throw error;

      // Reset batch status to DRAFT
      updateStatus.mutate({ batchId, status: 'DRAFT' });
      await refetchOutputs();
      toast.success('All outputs cleared');
    } catch (error) {
      console.error('Failed to clear outputs:', error);
      toast.error('Failed to clear outputs');
    }
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Batch Items</p>
              <p className="text-xl font-bold">{batchItems?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Poses Per Shot</p>
              <p className="text-xl font-bold">{config?.posesPerShotType || 2}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attempts Per Pose</p>
              <p className="text-xl font-bold">{config?.attemptsPerPose || 1}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Model</p>
              <Select value={selectedModel} onValueChange={handleModelChange} disabled={isGenerating}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPOSE_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <>
                <Button 
                  onClick={handleStartGeneration}
                  size="lg"
                  className="gap-2"
                  disabled={batch.status === 'COMPLETE'}
                >
                  <Play className="w-4 h-4" />
                  {batch.status === 'COMPLETE' ? 'Generation Complete' : totalCount > 0 ? 'Resume Generation' : 'Start Generation'}
                </Button>
                {totalCount > 0 && (
                  <Button 
                    onClick={handleClearOutputs}
                    size="lg"
                    variant="outline"
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Outputs
                  </Button>
                )}
              </>
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
