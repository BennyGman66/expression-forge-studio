import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Play, Square, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs, useUpdateReposeBatchStatus } from "@/hooks/useReposeBatches";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import type { ReposeConfig, PairingRules } from "@/types/repose";

interface GeneratePanelProps {
  batchId: string | undefined;
}

export function GeneratePanel({ batchId }: GeneratePanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const updateStatus = useUpdateReposeBatchStatus();

  const [isGenerating, setIsGenerating] = useState(false);
  const shouldStopRef = useRef(false);

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

  // Helper to extract view type from "Front View - filename.jpg" format
  const getViewType = (view: string): string => {
    const v = view.toLowerCase();
    if (v.startsWith('front')) return 'front';
    if (v.startsWith('back')) return 'back';
    if (v.startsWith('side')) return 'side';
    if (v.startsWith('detail')) return 'detail';
    return 'front';
  };

  // Get applicable slots based on view and pairing rules
  const getSlotsForView = (viewType: string, rules: PairingRules): string[] => {
    const slots: string[] = [];
    if (viewType === 'front') {
      if (rules.frontToSlotA) slots.push('A');
      if (rules.frontToSlotB) slots.push('B');
    } else if (viewType === 'back') {
      if (rules.backToSlotC) slots.push('C');
    } else if (viewType === 'side') {
      if (rules.sideToSlotB) slots.push('B');
    } else if (viewType === 'detail') {
      if (rules.detailToSlotD) slots.push('D');
    }
    return slots;
  };

  const handleStartGeneration = async () => {
    if (!batchId || !batch || !batchItems?.length) return;

    shouldStopRef.current = false;
    setIsGenerating(true);

    const config = batch.config_json as ReposeConfig;
    const pairingRules = config?.pairingRules || {};
    const randomPosesPerSlot = config?.randomPosesPerSlot || 2;
    const attemptsPerPose = config?.attemptsPerPose || 1;

    try {
      // Update batch status to RUNNING
      updateStatus.mutate({ batchId, status: 'RUNNING' });

      // Step 1: Check if outputs already exist (resume case)
      const { data: existingOutputs } = await supabase
        .from('repose_outputs')
        .select('id, status')
        .eq('batch_id', batchId);

      if (!existingOutputs?.length) {
        // Step 2: Fetch clay poses for the brand (direct from clay_images via product_images)
        const { data: clayPoses, error: posesError } = await supabase
          .from('clay_images')
          .select(`
            id,
            stored_url,
            product_images!inner(slot, products!inner(brand_id))
          `)
          .eq('product_images.products.brand_id', batch.brand_id);

        if (posesError) throw posesError;

        // Group poses by slot
        const posesBySlot: Record<string, Array<{ id: string; url: string }>> = { A: [], B: [], C: [], D: [] };
        clayPoses?.forEach((pose: { id: string; stored_url: string; product_images: { slot: string } }) => {
          const slot = pose.product_images?.slot;
          if (slot && posesBySlot[slot]) {
            posesBySlot[slot].push({ id: pose.id, url: pose.stored_url });
          }
        });

        console.log('Poses by slot:', Object.entries(posesBySlot).map(([k, v]) => `${k}: ${v.length}`).join(', '));

        // Step 3: Create repose_outputs for each batch_item + pose combination
        const outputsToCreate: Array<{
          batch_id: string;
          batch_item_id: string;
          pose_id: string | null;
          pose_url: string;
          slot: string;
          attempt_index: number;
          status: string;
        }> = [];

        for (const item of batchItems) {
          const viewType = getViewType(item.view);
          const slots = getSlotsForView(viewType, pairingRules);

          for (const slot of slots) {
            const posesInSlot = posesBySlot[slot] || [];
            // Randomly select poses for this slot
            const shuffled = [...posesInSlot].sort(() => Math.random() - 0.5);
            const selectedPoses = shuffled.slice(0, randomPosesPerSlot);

            for (const pose of selectedPoses) {
              for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
                outputsToCreate.push({
                  batch_id: batchId,
                  batch_item_id: item.id,
                  pose_id: pose.id,
                  pose_url: pose.url,
                  slot,
                  attempt_index: attempt,
                  status: 'queued',
                });
              }
            }
          }
        }

        if (outputsToCreate.length === 0) {
          toast.error('No outputs to generate. Check pairing rules and available poses.');
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
        await refetchOutputs();
      }

      // Step 4: Process queued outputs
      await processQueuedOutputs();

    } catch (error) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      updateStatus.mutate({ batchId, status: 'FAILED' });
      setIsGenerating(false);
    }
  };

  const processQueuedOutputs = async () => {
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
        toast.success('Generation complete!');
      }
      setIsGenerating(false);
      return;
    }

    console.log(`Processing ${queuedOutputs.length} queued outputs`);

    for (const output of queuedOutputs) {
      if (shouldStopRef.current) {
        console.log('Generation stopped by user');
        break;
      }

      try {
        const { error } = await supabase.functions.invoke('generate-repose-single', {
          body: { outputId: output.id },
        });

        if (error) {
          console.error(`Failed to process output ${output.id}:`, error);
          // Continue with next output
        }

        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`Error processing output ${output.id}:`, err);
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
        toast.success('Generation complete!');
      }
    }
    
    setIsGenerating(false);
  };

  const handleStopGeneration = () => {
    shouldStopRef.current = true;
    toast.info("Stopping generation after current task...");
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
