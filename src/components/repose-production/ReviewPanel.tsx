import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClipboardList, Star, RefreshCw, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs, useUpdateReposeBatchStatus } from "@/hooks/useReposeBatches";
import { usePipelineJobs } from "@/hooks/usePipelineJobs";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  OUTPUT_SHOT_LABELS, 
  slotToShotType, 
  OutputShotType, 
  ALL_OUTPUT_SHOT_TYPES,
  OUTPUT_SHOT_SHORT_LABELS,
  parseViewToInputType,
  getAllowedOutputsForInput,
  shotTypeToSlot,
} from "@/types/shot-types";
import { ReposeConfig, DEFAULT_REPOSE_MODEL } from "@/types/repose";

interface ReviewPanelProps {
  batchId: string | undefined;
}

interface LightboxImage {
  id: string;
  url: string;
  shotType: OutputShotType;
  itemView: string;
}

interface ShotTypeSummary {
  shotType: OutputShotType;
  completed: number;
  failed: number;
  missing: number;
  missingItemIds: string[];
  canRegenerate: boolean;
}

export function ReviewPanel({ batchId }: ReviewPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { data: outputs, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const updateStatus = useUpdateReposeBatchStatus();
  const { createJob, updateProgress, setStatus } = usePipelineJobs();

  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const pipelineJobIdRef = useRef<string | null>(null);

  // Calculate shot type summary with missing counts
  const shotTypeSummary = useMemo<ShotTypeSummary[]>(() => {
    if (!batchItems || !outputs) return [];

    return ALL_OUTPUT_SHOT_TYPES.map(shotType => {
      // Find batch items that CAN produce this shot type based on camera rules
      const eligibleItems = batchItems.filter(item => {
        const inputType = parseViewToInputType(item.view);
        if (!inputType) return false;
        const allowedOutputs = getAllowedOutputsForInput(inputType);
        return allowedOutputs.includes(shotType);
      });

      // Check which eligible items are missing outputs for this shot type
      const missingItemIds: string[] = [];
      let completed = 0;
      let failed = 0;

      for (const item of eligibleItems) {
        const itemOutputs = outputs.filter(o => {
          const outputShotType = (o.shot_type || slotToShotType(o.slot || '')) as OutputShotType;
          return o.batch_item_id === item.id && outputShotType === shotType;
        });

        if (itemOutputs.length === 0) {
          missingItemIds.push(item.id);
        } else {
          completed += itemOutputs.filter(o => o.status === 'complete').length;
          failed += itemOutputs.filter(o => o.status === 'failed').length;
        }
      }

      return {
        shotType,
        completed,
        failed,
        missing: missingItemIds.length,
        missingItemIds,
        canRegenerate: missingItemIds.length > 0,
      };
    });
  }, [batchItems, outputs]);

  // Regenerate handler
  const handleRegenerateShotType = async (shotType: OutputShotType, missingItemIds: string[]) => {
    if (!batchId || !batch || missingItemIds.length === 0) return;

    setIsRegenerating(true);
    const config = batch.config_json as ReposeConfig;
    const posesPerShotType = config?.posesPerShotType || 2;
    const attemptsPerPose = config?.attemptsPerPose || 1;
    const model = config?.model || DEFAULT_REPOSE_MODEL;

    try {
      console.log(`Regenerating ${shotType} for ${missingItemIds.length} items`);

      // Fetch clay poses for the brand for this shot type
      const { data: productImages, error: posesError } = await supabase
        .from('product_images')
        .select(`
          id, slot, shot_type,
          products!inner(brand_id),
          clay_images(id, stored_url)
        `)
        .eq('products.brand_id', batch.brand_id);

      if (posesError) throw posesError;

      // Collect poses for this shot type
      const poses: Array<{ id: string; url: string }> = [];
      productImages?.forEach((pi) => {
        let piShotType: OutputShotType | null = pi.shot_type as OutputShotType;
        if (!piShotType && pi.slot) {
          const slotMap: Record<string, OutputShotType> = { 'A': 'FRONT_FULL', 'B': 'FRONT_CROPPED', 'C': 'BACK_FULL', 'D': 'DETAIL' };
          piShotType = slotMap[pi.slot];
        }

        if (piShotType === shotType && pi.clay_images) {
          const clayImages = Array.isArray(pi.clay_images) ? pi.clay_images : [pi.clay_images];
          clayImages.forEach((ci: { id: string; stored_url: string }) => {
            if (ci?.id && ci?.stored_url) poses.push({ id: ci.id, url: ci.stored_url });
          });
        }
      });

      if (poses.length === 0) {
        toast.error(`No poses available for ${OUTPUT_SHOT_LABELS[shotType]}`);
        setIsRegenerating(false);
        return;
      }

      // Create outputs for missing items
      const outputsToCreate: Array<{
        batch_id: string; batch_item_id: string; pose_id: string | null; pose_url: string;
        slot: string; shot_type: OutputShotType; attempt_index: number; status: string;
      }> = [];

      for (const itemId of missingItemIds) {
        const shuffled = [...poses].sort(() => Math.random() - 0.5);
        const selectedPoses = shuffled.slice(0, posesPerShotType);

        for (const pose of selectedPoses) {
          for (let attempt = 0; attempt < attemptsPerPose; attempt++) {
            outputsToCreate.push({
              batch_id: batchId, batch_item_id: itemId, pose_id: pose.id, pose_url: pose.url,
              slot: shotTypeToSlot(shotType), shot_type: shotType, attempt_index: attempt, status: 'queued',
            });
          }
        }
      }

      if (outputsToCreate.length === 0) {
        toast.error('No outputs to generate');
        setIsRegenerating(false);
        return;
      }

      const { error: insertError } = await supabase.from('repose_outputs').insert(outputsToCreate);
      if (insertError) throw insertError;
      toast.success(`Created ${outputsToCreate.length} tasks for ${OUTPUT_SHOT_LABELS[shotType]}`);
      await refetchOutputs();

      // Create pipeline job and process
      const pipelineJobId = await createJob({
        type: 'REPOSE_GENERATION',
        title: `Regen ${OUTPUT_SHOT_SHORT_LABELS[shotType]}`,
        total: outputsToCreate.length,
        origin_route: `/repose-production/batch/${batchId}?tab=review`,
        origin_context: { batchId, shotType },
        supports_pause: true, supports_retry: false, supports_restart: false,
      });
      pipelineJobIdRef.current = pipelineJobId;
      updateStatus.mutate({ batchId, status: 'RUNNING' });

      // Process queued outputs
      const { data: queuedOutputs } = await supabase
        .from('repose_outputs').select('id').eq('batch_id', batchId).eq('status', 'queued').order('created_at');

      for (const output of queuedOutputs || []) {
        const { error } = await supabase.functions.invoke('generate-repose-single', { body: { outputId: output.id, model } });
        await updateProgress(pipelineJobId, { doneDelta: 1, failedDelta: error ? 1 : 0 });
        await new Promise(r => setTimeout(r, 500));
      }

      await refetchOutputs();
      updateStatus.mutate({ batchId, status: 'COMPLETE' });
      setStatus(pipelineJobId, 'COMPLETED');
      toast.success('Regeneration complete!');

    } catch (error) {
      console.error('Regeneration error:', error);
      toast.error(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (pipelineJobIdRef.current) setStatus(pipelineJobIdRef.current, 'FAILED');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Build flat list of all completed images for the lightbox
  const allCompletedImages: LightboxImage[] = [];
  outputs?.forEach((output) => {
    if (output.status === 'complete' && output.result_url) {
      const item = batchItems?.find(i => i.id === output.batch_item_id);
      const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
      allCompletedImages.push({
        id: output.id, url: output.result_url, shotType, itemView: item?.view || 'Unknown View',
      });
    }
  });

  // Group outputs by batch_item_id, then by shot type
  const groupedOutputs = outputs?.reduce((acc, output) => {
    const itemId = output.batch_item_id;
    if (!acc[itemId]) acc[itemId] = {} as Record<string, typeof outputs>;
    const shotType = (output.shot_type || slotToShotType(output.slot || '') || 'FRONT_FULL') as OutputShotType;
    if (!acc[itemId][shotType]) acc[itemId][shotType] = [];
    acc[itemId][shotType].push(output);
    return acc;
  }, {} as Record<string, Record<string, typeof outputs>>) || {};

  const toggleSelection = (outputId: string) => {
    const newSelected = new Set(selectedOutputs);
    if (newSelected.has(outputId)) newSelected.delete(outputId);
    else newSelected.add(outputId);
    setSelectedOutputs(newSelected);
  };

  const openLightbox = (outputId: string) => {
    const index = allCompletedImages.findIndex(img => img.id === outputId);
    if (index !== -1) { setLightboxIndex(index); setLightboxOpen(true); }
  };

  const handlePrevious = useCallback(() => {
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : allCompletedImages.length - 1));
  }, [allCompletedImages.length]);

  const handleNext = useCallback(() => {
    setLightboxIndex(prev => (prev < allCompletedImages.length - 1 ? prev + 1 : 0));
  }, [allCompletedImages.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevious();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === ' ') { e.preventDefault(); const img = allCompletedImages[lightboxIndex]; if (img) toggleSelection(img.id); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxIndex, handlePrevious, handleNext, allCompletedImages]);

  const currentLightboxImage = allCompletedImages[lightboxIndex];
  const completedCount = outputs?.filter(o => o.status === 'complete').length || 0;
  const failedCount = outputs?.filter(o => o.status === 'failed').length || 0;

  if (batchLoading) {
    return <div className="flex items-center justify-center py-12"><LeapfrogLoader /></div>;
  }

  if (!outputs?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No outputs to review yet. Run generation first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 bg-black/95 border-none">
          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="border-white/30 text-white">
                  {currentLightboxImage?.shotType ? OUTPUT_SHOT_LABELS[currentLightboxImage.shotType] : ''}
                </Badge>
                <span className="text-sm text-white/70">{currentLightboxImage?.itemView}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/70">
                  {lightboxIndex + 1} / {allCompletedImages.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  onClick={() => setLightboxOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Main image area */}
            <div className="flex-1 flex items-center justify-center relative px-16">
              {/* Previous button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handlePrevious}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>

              {/* Image */}
              {currentLightboxImage && (
                <img
                  src={currentLightboxImage.url}
                  alt={`Output ${lightboxIndex + 1}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              {/* Next button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handleNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </div>

            {/* Footer with selection */}
            <div className="p-4 flex items-center justify-center gap-4">
              <Button
                variant={currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) ? "default" : "outline"}
                onClick={() => currentLightboxImage && toggleSelection(currentLightboxImage.id)}
                className={cn(
                  "gap-2",
                  currentLightboxImage && selectedOutputs.has(currentLightboxImage.id)
                    ? "bg-primary text-primary-foreground"
                    : "border-white/30 text-white hover:bg-white/10"
                )}
              >
                <Star className={cn(
                  "w-4 h-4",
                  currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) && "fill-current"
                )} />
                {currentLightboxImage && selectedOutputs.has(currentLightboxImage.id) ? 'Selected' : 'Select'}
              </Button>
              <span className="text-xs text-white/50">Press Space to toggle selection</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shot Type Summary with Regeneration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Output Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {shotTypeSummary.map(({ shotType, completed, failed, missing, missingItemIds, canRegenerate }) => (
              <div 
                key={shotType} 
                className={cn(
                  "p-3 rounded-lg border",
                  missing > 0 ? "border-orange-500/30 bg-orange-500/5" : "border-border bg-secondary/20"
                )}
              >
                <p className="text-xs font-medium mb-1">{OUTPUT_SHOT_SHORT_LABELS[shotType]}</p>
                <div className="flex items-center gap-2 text-sm">
                  {completed > 0 && (
                    <span className="text-green-500 flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                      {completed}
                    </span>
                  )}
                  {failed > 0 && (
                    <span className="text-red-500">{failed} ✗</span>
                  )}
                  {missing > 0 && (
                    <span className="text-orange-500">{missing} ⚠</span>
                  )}
                  {completed === 0 && failed === 0 && missing === 0 && (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                {canRegenerate && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs w-full gap-1"
                    onClick={() => handleRegenerateShotType(shotType, missingItemIds)}
                    disabled={isRegenerating}
                  >
                    <RefreshCw className={cn("w-3 h-3", isRegenerating && "animate-spin")} />
                    Regen {missing}
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Overall stats */}
          <div className="flex items-center justify-between pt-3 border-t">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Total Complete</p>
                <p className="text-xl font-bold text-green-500">{completedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold text-red-500">{failedCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Selected</p>
                <p className="text-xl font-bold">{selectedOutputs.size}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results by Batch Item */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {batchItems?.map((item) => {
            const itemOutputs = groupedOutputs[item.id] || {};
            const shotTypes = Object.keys(itemOutputs) as OutputShotType[];

            if (shotTypes.length === 0) return null;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" />
                        {item.view.toUpperCase()} View
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Item: {item.id.slice(0, 8)}...
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {Object.values(itemOutputs).flat().filter((o: any) => o?.status === 'complete').length} complete
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Source Image */}
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2">Source</p>
                    <div className="w-24 h-24 bg-secondary rounded-lg overflow-hidden">
                      {item.source_url ? (
                        <img 
                          src={item.source_url} 
                          alt="Source" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outputs by Shot Type */}
                  {shotTypes.map((shotType) => (
                    <div key={shotType} className="mb-4">
                      <p className="text-sm font-medium mb-2">{OUTPUT_SHOT_LABELS[shotType]}</p>
                      <div className="flex flex-wrap gap-2">
                        {itemOutputs[shotType]?.map((output) => (
                          <div
                            key={output.id}
                            onClick={() => {
                              if (output.status === 'complete' && output.result_url) {
                                openLightbox(output.id);
                              }
                            }}
                            className={cn(
                              "relative w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105",
                              output.status === 'complete' && selectedOutputs.has(output.id)
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-transparent",
                              output.status === 'failed' && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {output.result_url ? (
                              <img 
                                src={output.result_url} 
                                alt={`Output ${output.attempt_index}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-secondary flex items-center justify-center">
                                {output.status === 'queued' && <span className="text-xs">Queued</span>}
                                {output.status === 'running' && <LeapfrogLoader />}
                                {output.status === 'failed' && <span className="text-xs text-red-500">Failed</span>}
                              </div>
                            )}

                            {/* Selection indicator */}
                            {output.status === 'complete' && selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <Star className="w-3 h-3 text-primary-foreground fill-current" />
                              </div>
                            )}

                            {/* Status indicator */}
                            {output.status === 'complete' && !selectedOutputs.has(output.id) && (
                              <div className="absolute top-1 right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
