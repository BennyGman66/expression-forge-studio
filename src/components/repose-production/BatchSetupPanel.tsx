import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ArrowRight, 
  AlertCircle, 
  Shirt, 
  Layers, 
  Play, 
  Square, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  RotateCcw,
  Eye,
  Clock,
  ChevronDown,
  ChevronUp,
  Settings2,
  Sparkles,
  Image as ImageIcon
} from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useReposeOutputs, useUpdateReposeBatchConfig, useUpdateReposeBatchStatus } from "@/hooks/useReposeBatches";
import { useUpdateLookProductType } from "@/hooks/useProductionProjects";
import { useBatchReposeRuns, useReposeRunCounts, useLastReposeRuns, useCreateReposeRuns, useUpdateReposeRun, useDetectStalledRuns } from "@/hooks/useReposeRuns";
import { usePipelineJobs } from "@/hooks/usePipelineJobs";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReposeConfig } from "@/types/repose";
import type { ReposeRun } from "@/hooks/useReposeRuns";
import { ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import { REPOSE_MODEL_OPTIONS, DEFAULT_REPOSE_MODEL } from "@/types/repose";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

interface BatchSetupPanelProps {
  batchId: string | undefined;
}

interface ClayPoseCount {
  brandId: string;
  brandName: string;
  total: number;
  FRONT_FULL: number;
  FRONT_CROPPED: number;
  DETAIL: number;
  BACK_FULL: number;
}

interface LookRow {
  lookId: string;
  lookName: string;
  productType: 'top' | 'trousers' | null;
  views: Array<{ view: string; sourceUrl: string }>;
  isReady: boolean;
  completedRuns: number;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  currentStatus: 'queued' | 'running' | null;
  thumbnailUrl: string | null;
}

export function BatchSetupPanel({ batchId }: BatchSetupPanelProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  
  // Data fetching
  const { data: batch, isLoading: batchLoading, refetch: refetchBatch } = useReposeBatch(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);
  const { data: runs, refetch: refetchRuns } = useBatchReposeRuns(batchId);
  const { data: outputs, refetch: refetchOutputs } = useReposeOutputs(batchId);
  const updateConfig = useUpdateReposeBatchConfig();
  const updateStatus = useUpdateReposeBatchStatus();
  const updateLookProductType = useUpdateLookProductType();
  const createRuns = useCreateReposeRuns();
  const updateRun = useUpdateReposeRun();
  const detectStalled = useDetectStalledRuns();
  const { createJob, updateProgress, setStatus } = usePipelineJobs();

  // Local state
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [rendersPerLook, setRendersPerLook] = useState(2);
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_REPOSE_MODEL);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [inspectedLookId, setInspectedLookId] = useState<string | null>(null);
  const [clayPoseCounts, setClayPoseCounts] = useState<ClayPoseCount[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(false);
  
  const shouldStopRef = useRef(false);
  const pipelineJobIdRef = useRef<string | null>(null);

  // Look up look_id via source_output_id for items with missing look_id
  const { data: outputLookMap } = useQuery({
    queryKey: ["batch-output-look-map", batchItems?.map(i => i.source_output_id).filter(Boolean)],
    queryFn: async () => {
      const outputIds = batchItems?.map(i => i.source_output_id).filter(Boolean) as string[];
      if (outputIds.length === 0) return {};
      
      const { data } = await supabase
        .from("job_outputs")
        .select("id, job:unified_jobs(look_id)")
        .in("id", outputIds);
      
      const map: Record<string, string> = {};
      data?.forEach((output: any) => {
        if (output.job?.look_id) {
          map[output.id] = output.job.look_id;
        }
      });
      return map;
    },
    enabled: !!batchItems && batchItems.some(i => !i.look_id && i.source_output_id),
  });

  // Get unique look IDs from batch items
  const lookIds = useMemo(() => {
    if (!batchItems?.length) return [];
    const ids = new Set<string>();
    batchItems.forEach(i => {
      if (i.look_id) {
        ids.add(i.look_id);
      } else if (outputLookMap?.[i.source_output_id || '']) {
        ids.add(outputLookMap[i.source_output_id || '']);
      }
    });
    return [...ids];
  }, [batchItems, outputLookMap]);

  // Fetch look details
  const { data: lookDetails } = useQuery({
    queryKey: ["batch-look-details", lookIds],
    queryFn: async () => {
      if (lookIds.length === 0) return [];
      const { data } = await supabase
        .from("talent_looks")
        .select("id, name, product_type")
        .in("id", lookIds);
      return data || [];
    },
    enabled: lookIds.length > 0,
  });

  // Fetch detail images for thumbnails
  const { data: detailImages } = useQuery({
    queryKey: ["batch-look-detail-images", lookIds],
    queryFn: async () => {
      if (lookIds.length === 0) return {};
      const { data } = await supabase
        .from("look_source_images")
        .select("look_id, source_url")
        .in("look_id", lookIds)
        .eq("view", "detail");
      
      const map: Record<string, string> = {};
      data?.forEach(img => {
        if (img.look_id) map[img.look_id] = img.source_url;
      });
      return map;
    },
    enabled: lookIds.length > 0,
  });

  // Get run counts and last runs
  const { data: runCounts } = useReposeRunCounts(lookIds, selectedBrandId);
  const { data: lastRuns } = useLastReposeRuns(lookIds, selectedBrandId);

  // Build look rows with all info
  const lookRows = useMemo((): LookRow[] => {
    if (!batchItems?.length) return [];
    
    const grouped = new Map<string, LookRow>();
    
    batchItems.forEach(item => {
      const lookId = item.look_id || outputLookMap?.[item.source_output_id || ''] || 'unknown';
      
      if (!grouped.has(lookId)) {
        const lookDetail = lookDetails?.find(l => l.id === lookId);
        const runCount = runCounts?.[lookId] || 0;
        const lastRun = lastRuns?.[lookId];
        
        // Check current run status from runs data
        const activeRun = runs?.find(r => r.look_id === lookId && (r.status === 'running' || r.status === 'queued'));
        
        grouped.set(lookId, {
          lookId,
          lookName: lookDetail?.name || 'Unknown Look',
          productType: (lookDetail?.product_type as 'top' | 'trousers' | null) || null,
          views: [],
          isReady: true, // Will check below
          completedRuns: runCount,
          lastRunStatus: lastRun?.status || null,
          lastRunAt: lastRun?.completed_at || null,
          currentStatus: activeRun?.status as 'queued' | 'running' | null || null,
          thumbnailUrl: detailImages?.[lookId] || null,
        });
      }
      grouped.get(lookId)!.views.push({
        view: item.view,
        sourceUrl: item.source_url,
      });
    });
    
    // Check readiness (has all required views)
    grouped.forEach((row) => {
      row.isReady = row.productType !== null && row.views.length >= 1;
    });
    
    return Array.from(grouped.values()).sort((a, b) => a.lookName.localeCompare(b.lookName));
  }, [batchItems, lookDetails, outputLookMap, runCounts, lastRuns, runs, detailImages]);

  // Load clay pose counts per brand
  useEffect(() => {
    async function loadCounts() {
      setLoadingCounts(true);
      try {
        const { data: clayImages } = await supabase
          .from("clay_images")
          .select(`
            id,
            product_image_id,
            product_images!inner(
              slot,
              shot_type,
              products!inner(
                brand_id,
                brands!inner(name)
              )
            )
          `);

        if (clayImages) {
          const countsByBrand: Record<string, ClayPoseCount> = {};
          
          clayImages.forEach((clay: any) => {
            const brandId = clay.product_images?.products?.brand_id;
            const brandName = clay.product_images?.products?.brands?.name;
            const slot = clay.product_images?.slot || '';
            const shotType = clay.product_images?.shot_type || 
              (slot === 'A' ? 'FRONT_FULL' : slot === 'B' ? 'FRONT_CROPPED' : slot === 'C' ? 'BACK_FULL' : slot === 'D' ? 'DETAIL' : '');

            if (!brandId) return;

            if (!countsByBrand[brandId]) {
              countsByBrand[brandId] = {
                brandId,
                brandName: brandName || 'Unknown',
                total: 0,
                FRONT_FULL: 0,
                FRONT_CROPPED: 0,
                DETAIL: 0,
                BACK_FULL: 0,
              };
            }

            countsByBrand[brandId].total++;
            if (shotType === 'FRONT_FULL') countsByBrand[brandId].FRONT_FULL++;
            else if (shotType === 'FRONT_CROPPED') countsByBrand[brandId].FRONT_CROPPED++;
            else if (shotType === 'DETAIL') countsByBrand[brandId].DETAIL++;
            else if (shotType === 'BACK_FULL') countsByBrand[brandId].BACK_FULL++;
          });

          setClayPoseCounts(Object.values(countsByBrand));
        }
      } catch (error) {
        console.error("Error loading clay pose counts:", error);
      }
      setLoadingCounts(false);
    }

    loadCounts();
  }, []);

  // Initialize from batch config
  useEffect(() => {
    if (batch) {
      if (batch.brand_id) setSelectedBrandId(batch.brand_id);
      const config = batch.config_json as ReposeConfig;
      if (config?.posesPerShotType) setRendersPerLook(config.posesPerShotType);
      if (config?.model) setSelectedModel(config.model);
    }
  }, [batch]);

  // Realtime subscription for runs
  useEffect(() => {
    if (!batchId) return;

    const channel = supabase
      .channel(`repose-runs-${batchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'repose_runs',
          filter: `batch_id=eq.${batchId}`,
        },
        () => {
          refetchRuns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [batchId, refetchRuns]);

  // Realtime subscription for outputs
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

  // Track generation based on runs
  useEffect(() => {
    const hasRunning = runs?.some(r => r.status === 'running');
    const hasQueued = runs?.some(r => r.status === 'queued');
    setIsGenerating(hasRunning || false);
    
    // Update batch status if needed
    if (batch?.status === 'DRAFT' && (hasRunning || hasQueued)) {
      updateStatus.mutate({ batchId: batchId!, status: 'RUNNING' });
    }
  }, [runs, batch?.status, batchId]);

  // Stall detection
  useEffect(() => {
    if (!isGenerating) return;
    
    const interval = setInterval(() => {
      detectStalled.mutate(5);
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [isGenerating]);

  const selectedBrandCounts = clayPoseCounts.find(c => c.brandId === selectedBrandId);

  // Selection handlers
  const toggleLook = (lookId: string) => {
    const newSet = new Set(selectedLookIds);
    if (newSet.has(lookId)) {
      newSet.delete(lookId);
    } else {
      newSet.add(lookId);
    }
    setSelectedLookIds(newSet);
  };

  const selectAll = () => {
    setSelectedLookIds(new Set(lookRows.map(l => l.lookId)));
  };

  const clearSelection = () => {
    setSelectedLookIds(new Set());
  };

  const handleProductTypeChange = (lookId: string, productType: 'top' | 'trousers') => {
    updateLookProductType.mutate({ lookId, productType });
  };

  const handleBulkSetProductType = (productType: 'top' | 'trousers') => {
    lookRows.forEach(look => {
      if (look.lookId !== 'unknown') {
        updateLookProductType.mutate({ lookId: look.lookId, productType });
      }
    });
  };

  // Queue stats
  const queueStats = useMemo(() => {
    if (!runs) return { queued: 0, running: 0, complete: 0, failed: 0 };
    return {
      queued: runs.filter(r => r.status === 'queued').length,
      running: runs.filter(r => r.status === 'running').length,
      complete: runs.filter(r => r.status === 'complete').length,
      failed: runs.filter(r => r.status === 'failed').length,
    };
  }, [runs]);

  const totalRuns = queueStats.queued + queueStats.running + queueStats.complete + queueStats.failed;
  const progressPercent = totalRuns > 0 ? ((queueStats.complete + queueStats.failed) / totalRuns) * 100 : 0;

  // Detect abandoned queued runs (queued but nothing running and not actively generating)
  const hasAbandonedQueue = useMemo(() => {
    if (!runs || !batchId) return false;
    const hasQueued = runs.some(r => r.status === 'queued');
    const hasRunning = runs.some(r => r.status === 'running');
    // Abandoned if we have queued but nothing running
    return hasQueued && !hasRunning && !isGenerating;
  }, [runs, batchId, isGenerating]);

  // Estimated outputs calculation
  const selectedLooks = lookRows.filter(l => selectedLookIds.has(l.lookId));
  const readySelectedLooks = selectedLooks.filter(l => l.isReady);
  const estimatedNewRuns = selectedLooks.length * rendersPerLook;

  // Start generation - now calls background edge function
  const handleStartGeneration = async () => {
    if (!batchId || selectedLooks.length === 0 || !selectedBrandId) return;

    shouldStopRef.current = false;
    setIsGenerating(true);

    try {
      // Save config
      const config: ReposeConfig = {
        posesPerShotType: rendersPerLook,
        attemptsPerPose: 1,
        model: selectedModel,
      };
      await updateConfig.mutateAsync({ batchId, config, brandId: selectedBrandId });

      // Create runs for selected looks
      const lookIdsToQueue = selectedLooks.map(l => l.lookId);

      // Build run records for each look
      const runsToCreate: Array<Record<string, unknown>> = [];
      
      for (const lookId of lookIdsToQueue) {
        // Get next run index
        const existingRuns = runs?.filter(r => r.look_id === lookId) || [];
        const maxIndex = existingRuns.reduce((max, r) => Math.max(max, r.run_index), 0);
        
        for (let i = 0; i < rendersPerLook; i++) {
          runsToCreate.push({
            batch_id: batchId,
            look_id: lookId,
            brand_id: selectedBrandId,
            run_index: maxIndex + 1 + i,
            config_snapshot: { ...config, brand_id: selectedBrandId } as Record<string, unknown>,
          });
        }
      }

      const { error: insertError } = await supabase
        .from('repose_runs')
        .insert(runsToCreate as any);
      
      if (insertError) throw insertError;

      toast.success(`Queued ${runsToCreate.length} render runs`);
      
      // Update batch status
      updateStatus.mutate({ batchId, status: 'RUNNING' });
      
      // Clear selection
      setSelectedLookIds(new Set());
      
      // Refetch runs
      await refetchRuns();

      // Create pipeline job for tracking
      const pipelineJobId = await createJob({
        type: 'REPOSE_GENERATION',
        title: `Repose: ${lookIdsToQueue.length} looks`,
        total: runsToCreate.length,
        origin_route: `/repose-production/batch/${batchId}?tab=setup`,
        origin_context: { batchId, model: selectedModel },
        supports_pause: true,
        supports_retry: false,
        supports_restart: false,
      });
      pipelineJobIdRef.current = pipelineJobId;

      // Call background edge function instead of client-side processing
      console.log(`[BatchSetupPanel] Starting background queue processing via edge function`);
      const { error: invokeError } = await supabase.functions.invoke('process-repose-queue', {
        body: { 
          batchId, 
          pipelineJobId,
          model: selectedModel,
        },
      });

      if (invokeError) {
        console.error('Failed to start queue processor:', invokeError);
        toast.error('Failed to start background processing');
      } else {
        toast.success('Generation started in background - you can close this tab');
      }

      // Generation continues in background, UI updates via realtime
      setIsGenerating(false);

    } catch (error) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGenerating(false);
    }
  };

  // Stop generation - sets job to paused
  const handleStopGeneration = async () => {
    if (!pipelineJobIdRef.current) return;
    
    try {
      await setStatus(pipelineJobIdRef.current, 'PAUSED');
      toast.info('Generation paused');
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  };

  // Retry failed runs - calls edge function
  const handleRetryFailed = async () => {
    if (!batchId) return;

    const { error } = await supabase
      .from('repose_runs')
      .update({ status: 'queued', error_message: null, started_at: null })
      .eq('batch_id', batchId)
      .eq('status', 'failed');

    if (error) {
      toast.error('Failed to retry');
      return;
    }

    toast.success('Failed runs queued for retry');
    await refetchRuns();

    // Start background processing via edge function
    const pipelineJobId = await createJob({
      type: 'REPOSE_GENERATION',
      title: `Repose Retry: ${queueStats.failed} runs`,
      total: queueStats.failed,
      origin_route: `/repose-production/batch/${batchId}?tab=setup`,
      origin_context: { batchId, model: selectedModel },
      supports_pause: true,
    });
    pipelineJobIdRef.current = pipelineJobId;

    await supabase.functions.invoke('process-repose-queue', {
      body: { batchId, pipelineJobId, model: selectedModel },
    });
  };

  // Resume abandoned queue - calls edge function
  const handleResumeQueue = async () => {
    if (!batchId) return;

    try {
      const existingQueued = queueStats.queued;
      const existingComplete = queueStats.complete + queueStats.failed;

      const pipelineJobId = await createJob({
        type: 'REPOSE_GENERATION',
        title: `Repose Resume: ${existingQueued} remaining`,
        total: existingQueued + existingComplete,
        origin_route: `/repose-production/batch/${batchId}?tab=setup`,
        origin_context: { batchId, model: selectedModel },
        supports_pause: true,
      });

      if (existingComplete > 0) {
        await updateProgress(pipelineJobId, { doneDelta: existingComplete });
      }

      pipelineJobIdRef.current = pipelineJobId;
      updateStatus.mutate({ batchId, status: 'RUNNING' });
      toast.success(`Resuming ${existingQueued} queued runs in background`);

      await supabase.functions.invoke('process-repose-queue', {
        body: { batchId, pipelineJobId, model: selectedModel },
      });
    } catch (error) {
      console.error('Resume error:', error);
      toast.error(`Resume failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Clear abandoned queue
  const handleClearAbandonedQueue = async () => {
    if (!batchId) return;

    const { error } = await supabase
      .from('repose_runs')
      .delete()
      .eq('batch_id', batchId)
      .eq('status', 'queued');

    if (!error) {
      toast.success('Cleared abandoned queue');
      refetchRuns();
    }
  };


  // Inspect look
  const inspectedLook = lookRows.find(l => l.lookId === inspectedLookId);
  const inspectedLookRuns = runs?.filter(r => r.look_id === inspectedLookId) || [];

  if (batchLoading || itemsLoading) {
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
        <p>No batch selected. Please select a project first.</p>
      </div>
    );
  }

  const looksWithoutProductType = lookRows.filter(l => l.productType === null).length;

  return (
    <div className="flex gap-6">
      {/* Main Content */}
      <div className="flex-1 space-y-6">
        {/* Setup Card - Pose Library & Renders */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-lg">Setup</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pose Library */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Pose Library</label>
                <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a brand..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clayPoseCounts.map((counts) => (
                      <SelectItem key={counts.brandId} value={counts.brandId}>
                        <div className="flex items-center gap-2">
                          <span>{counts.brandName}</span>
                          <Badge variant="outline" className="text-xs">
                            {counts.total} poses
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Renders per Look */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Renders per Look</label>
                <Select 
                  value={rendersPerLook.toString()} 
                  onValueChange={(v) => setRendersPerLook(parseInt(v))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Brand pose breakdown */}
            {selectedBrandCounts && (
              <div className="mt-3 p-2.5 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{selectedBrandCounts.brandName}:</span>
                  {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                    <span key={shotType} className="text-muted-foreground">
                      {OUTPUT_SHOT_LABELS[shotType]}: <span className="font-medium text-foreground">{selectedBrandCounts[shotType]}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Advanced options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="mt-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                  <Settings2 className="w-3.5 h-3.5" />
                  Advanced
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Model</label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="h-9 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPOSE_MODEL_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* Abandoned Queue Alert */}
        {hasAbandonedQueue && !isGenerating && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-400">Abandoned Queue Detected</p>
                    <p className="text-sm text-amber-700/80 dark:text-amber-500/80">
                      {queueStats.queued} runs were queued but never completed
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleClearAbandonedQueue}>
                    <XCircle className="w-4 h-4 mr-1.5" />
                    Clear Queue
                  </Button>
                  <Button size="sm" onClick={handleResumeQueue} className="gap-1.5">
                    <Play className="w-4 h-4" />
                    Resume ({queueStats.queued})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Progress (when running) */}
        {(queueStats.running > 0 || (queueStats.queued > 0 && isGenerating)) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                  <span className="font-medium">Generating</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {queueStats.complete + queueStats.failed} / {totalRuns} runs
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  {queueStats.running} running
                </span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  {queueStats.queued} queued
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                  {queueStats.complete} complete
                </span>
                {queueStats.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-500">
                    <XCircle className="w-3 h-3" />
                    {queueStats.failed} failed
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Looks Table */}
        <Card>
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Looks in Batch ({lookRows.length})</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Set all to:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkSetProductType('top')}
                className="gap-1 h-7"
              >
                <Shirt className="w-3 h-3" />
                Tops
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkSetProductType('trousers')}
                className="gap-1 h-7"
              >
                <Layers className="w-3 h-3" />
                Trousers
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {looksWithoutProductType > 0 && (
              <div className="mx-4 mb-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4 inline-block mr-2" />
                {looksWithoutProductType} look{looksWithoutProductType > 1 ? 's' : ''} need product type set
              </div>
            )}

            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={selectedLookIds.size === lookRows.length && lookRows.length > 0}
                        onCheckedChange={(checked) => checked ? selectAll() : clearSelection()}
                      />
                    </TableHead>
                    <TableHead className="w-14"></TableHead>
                    <TableHead>Look / SKU</TableHead>
                    <TableHead className="w-32">Product Type</TableHead>
                    <TableHead className="w-24 text-center">Rendered</TableHead>
                    <TableHead className="w-32">Last Run</TableHead>
                    <TableHead className="w-24 text-center">Status</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lookRows.map((look) => (
                    <TableRow 
                      key={look.lookId} 
                      className={cn(
                        "transition-colors",
                        selectedLookIds.has(look.lookId) && "bg-primary/5",
                        look.currentStatus === 'running' && "bg-blue-500/5"
                      )}
                    >
                      <TableCell>
                        <Checkbox 
                          checked={selectedLookIds.has(look.lookId)}
                          onCheckedChange={() => toggleLook(look.lookId)}
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <div className="w-10 h-10 rounded overflow-hidden bg-muted">
                          {look.thumbnailUrl ? (
                            <OptimizedImage
                              src={look.thumbnailUrl}
                              tier="tiny"
                              alt={look.lookName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{look.lookName}</p>
                          <p className="text-xs text-muted-foreground">{look.views.length} views</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={look.productType === 'top' ? 'default' : 'outline'}
                            onClick={() => handleProductTypeChange(look.lookId, 'top')}
                            className="h-6 px-2 text-xs"
                            disabled={look.lookId === 'unknown'}
                          >
                            Top
                          </Button>
                          <Button
                            size="sm"
                            variant={look.productType === 'trousers' ? 'default' : 'outline'}
                            onClick={() => handleProductTypeChange(look.lookId, 'trousers')}
                            className="h-6 px-2 text-xs"
                            disabled={look.lookId === 'unknown'}
                          >
                            Trousers
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">
                          {look.completedRuns} runs
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {look.lastRunAt ? (
                          <div className="text-xs">
                            <p className="text-muted-foreground">
                              {formatDistanceToNow(new Date(look.lastRunAt), { addSuffix: true })}
                            </p>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-[10px] px-1",
                                look.lastRunStatus === 'complete' && "text-green-600 border-green-500/30",
                                look.lastRunStatus === 'failed' && "text-red-600 border-red-500/30"
                              )}
                            >
                              {look.lastRunStatus}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {look.currentStatus === 'running' && (
                          <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-xs gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Running
                          </Badge>
                        )}
                        {look.currentStatus === 'queued' && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            Queued
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setInspectedLookId(look.lookId)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Sticky Action Bar */}
        <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 -mx-6 px-6">
          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div>
              <p className="text-sm text-muted-foreground">
                {selectedLookIds.size} looks selected × {rendersPerLook} renders = <span className="font-bold text-foreground">{estimatedNewRuns} runs</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {queueStats.failed > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRetryFailed}
                  className="gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry {queueStats.failed} Failed
                </Button>
              )}
              {selectedLookIds.size > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear Selection
                </Button>
              )}
              {isGenerating ? (
                <Button 
                  onClick={handleStopGeneration}
                  variant="destructive"
                  className="gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </Button>
              ) : (
                <Button 
                  onClick={handleStartGeneration}
                  disabled={selectedLookIds.size === 0 || !selectedBrandId}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start Generation
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Drawer (Look Inspector) */}
      <Sheet open={!!inspectedLookId} onOpenChange={(open) => !open && setInspectedLookId(null)}>
        <SheetContent className="w-[400px] sm:w-[450px]">
          <SheetHeader>
            <SheetTitle>{inspectedLook?.lookName || 'Look Details'}</SheetTitle>
            <SheetDescription>
              View sources and render history
            </SheetDescription>
          </SheetHeader>
          
          {inspectedLook && (
            <div className="mt-6 space-y-6">
              {/* Source thumbnails */}
              <div>
                <h4 className="text-sm font-medium mb-2">Source Views</h4>
                <div className="grid grid-cols-4 gap-2">
                  {inspectedLook.views.map((v, i) => (
                    <div key={i} className="aspect-[3/4] bg-muted rounded-lg overflow-hidden border">
                      <img src={v.sourceUrl} alt={v.view} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Product type */}
              <div>
                <h4 className="text-sm font-medium mb-2">Product Type</h4>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={inspectedLook.productType === 'top' ? 'default' : 'outline'}
                    onClick={() => handleProductTypeChange(inspectedLook.lookId, 'top')}
                    className="gap-1"
                  >
                    <Shirt className="w-3 h-3" />
                    Top
                  </Button>
                  <Button
                    size="sm"
                    variant={inspectedLook.productType === 'trousers' ? 'default' : 'outline'}
                    onClick={() => handleProductTypeChange(inspectedLook.lookId, 'trousers')}
                    className="gap-1"
                  >
                    <Layers className="w-3 h-3" />
                    Trousers
                  </Button>
                </div>
              </div>

              {/* Run history */}
              <div>
                <h4 className="text-sm font-medium mb-2">Render History ({inspectedLookRuns.length} runs)</h4>
                {inspectedLookRuns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No renders yet</p>
                ) : (
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                      {inspectedLookRuns.map((run) => (
                        <div 
                          key={run.id} 
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm"
                        >
                          <div>
                            <p className="font-medium">Run #{run.run_index}</p>
                            <p className="text-xs text-muted-foreground">
                              {run.created_at && format(new Date(run.created_at), 'MMM d, h:mm a')}
                            </p>
                          </div>
                          <Badge 
                            variant="outline"
                            className={cn(
                              run.status === 'complete' && "text-green-600 border-green-500/30",
                              run.status === 'failed' && "text-red-600 border-red-500/30",
                              run.status === 'running' && "text-blue-600 border-blue-500/30"
                            )}
                          >
                            {run.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* Quick re-run */}
              <Button 
                className="w-full gap-2"
                onClick={() => {
                  setSelectedLookIds(new Set([inspectedLook.lookId]));
                  setInspectedLookId(null);
                }}
              >
                <Play className="w-4 h-4" />
                Queue This Look
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
