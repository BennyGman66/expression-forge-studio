import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, User, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { FaceFoundation, VIEW_LABELS } from "@/types/face-application";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { useGenerationTracking, LookGenerationStats } from "@/hooks/useGenerationTracking";
import { GenerationFilters, FilterMode } from "./GenerationFilters";
import { LookGenerationCard } from "./LookGenerationCard";
import { SmartSelectionToolbar } from "./SmartSelectionToolbar";
import { GenerationPlanPreview } from "./GenerationPlanPreview";
import { GenerationProgressPanel } from "./GenerationProgressPanel";
import { GeneratedImagesGallery } from "./GeneratedImagesGallery";

interface GenerateTabEnhancedProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
  selectedLookIds?: Set<string>;
  onContinue: () => void;
}

const ATTEMPT_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash-image-preview", label: "Nano Fast" },
  { value: "google/gemini-3-pro-image-preview", label: "Nano Pro" },
];

interface OutputCounts {
  completed: number;
  failed: number;
  pending: number;
  generating: number;
}

interface GeneratedOutput {
  id: string;
  stored_url: string;
  view: string;
  attempt_index: number;
  status: string;
  look_id: string;
}

export function GenerateTabEnhanced({ 
  projectId, 
  lookId, 
  talentId, 
  selectedLookIds: propSelectedLookIds,
  onContinue 
}: GenerateTabEnhancedProps) {
  // Generation settings
  const [attemptsPerView, setAttemptsPerView] = useState(4);
  const [selectedModel, setSelectedModel] = useState("google/gemini-3-pro-image-preview");
  
  // Filter and selection state
  const [filterMode, setFilterMode] = useState<FilterMode>('needs_generation');
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  const [allowRegenerate, setAllowRegenerate] = useState(false);
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentBatchJobIds, setCurrentBatchJobIds] = useState<string[]>([]);
  const [generationStartTime, setGenerationStartTime] = useState<Date | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState("");
  const [lastActivitySeconds, setLastActivitySeconds] = useState<number | null>(null);
  const [outputCounts, setOutputCounts] = useState<OutputCounts>({ completed: 0, failed: 0, pending: 0, generating: 0 });
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutput[]>([]);
  
  // Auxiliary data
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [talentInfo, setTalentInfo] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Use the generation tracking hook
  const { 
    looks, 
    isLoading, 
    summary, 
    getFilteredLooks,
    getViewsNeedingGeneration,
    refresh: refreshTracking
  } = useGenerationTracking({
    projectId,
    requiredOptions: attemptsPerView,
    selectedLookIds: propSelectedLookIds,
    lastRunTimestamp,
  });

  // Get filtered looks based on current filter
  const filteredLooks = useMemo(() => getFilteredLooks(filterMode), [getFilteredLooks, filterMode]);

  // Filter counts for the filter bar
  const filterCounts = useMemo(() => ({
    all: summary.totalLooks,
    needsGeneration: summary.looksNeedGeneration,
    new: summary.looksNew,
    complete: summary.looksComplete,
    failed: looks.filter(l => l.views.some(v => v.failedCount > 0)).length,
  }), [summary, looks]);

  // Calculate what will be generated for selected looks
  const generationPlan = useMemo(() => {
    const selectedLooks = looks.filter(l => selectedLookIds.has(l.lookId));
    let totalViewsToGenerate = 0;
    let outputsToGenerate = 0;
    let existingOutputsCount = 0;

    for (const look of selectedLooks) {
      for (const viewStat of look.views) {
        const missing = allowRegenerate 
          ? attemptsPerView  // Generate all
          : Math.max(0, attemptsPerView - viewStat.completedCount); // Only missing

        if (missing > 0) {
          totalViewsToGenerate++;
          outputsToGenerate += missing;
        }
        existingOutputsCount += viewStat.completedCount;
      }
    }

    return {
      selectedLooksCount: selectedLooks.length,
      totalViewsToGenerate,
      outputsToGenerate,
      existingOutputsCount: allowRegenerate ? 0 : existingOutputsCount,
    };
  }, [selectedLookIds, looks, attemptsPerView, allowRegenerate]);

  // Auto-select needs generation looks when filter changes
  useEffect(() => {
    if (filterMode === 'needs_generation' && looks.length > 0) {
      const needsGenLooks = looks.filter(l => l.needsGeneration);
      setSelectedLookIds(new Set(needsGenLooks.map(l => l.lookId)));
    }
  }, [filterMode, looks]);

  // Fetch talent info
  useEffect(() => {
    const talentIds = [...new Set(looks.map(l => l.digitalTalentId).filter(Boolean))] as string[];
    if (talentIds.length === 0) return;
    
    const fetchTalentInfo = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("name, front_face_url")
        .eq("id", talentIds[0])
        .single();
      if (data) setTalentInfo(data);
    };
    fetchTalentInfo();
  }, [looks]);

  // Fetch face foundations
  useEffect(() => {
    const talentIds = [...new Set(looks.map(l => l.digitalTalentId).filter(Boolean))] as string[];
    if (talentIds.length === 0) return;

    const fetchFaceFoundations = async () => {
      const { data } = await supabase
        .from("face_pairing_outputs")
        .select(`
          id,
          stored_url,
          pairing:face_pairings!inner(
            digital_talent_id,
            cropped_face_id
          )
        `)
        .eq("status", "completed")
        .eq("is_face_foundation", true)
        .not("stored_url", "is", null);

      if (data) {
        const foundations: FaceFoundation[] = [];
        for (const output of data) {
          const pairing = output.pairing as any;
          if (pairing?.digital_talent_id && talentIds.includes(pairing.digital_talent_id) && output.stored_url) {
            const { data: identityImage } = await supabase
              .from("face_identity_images")
              .select("view")
              .eq("scrape_image_id", pairing.cropped_face_id)
              .maybeSingle();

            foundations.push({
              id: output.id,
              stored_url: output.stored_url,
              view: (identityImage?.view as any) || "unknown",
              digital_talent_id: pairing.digital_talent_id,
            });
          }
        }
        setFaceFoundations(foundations);
      }
    };
    fetchFaceFoundations();
  }, [looks]);

  // Elapsed time counter
  useEffect(() => {
    if (!generationStartTime || !isGenerating) {
      setElapsedDisplay("");
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - generationStartTime.getTime()) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setElapsedDisplay(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [generationStartTime, isGenerating]);

  // Poll for output counts when generating
  useEffect(() => {
    if (currentBatchJobIds.length === 0) {
      return;
    }

    const fetchOutputs = async () => {
      const { data: outputs } = await supabase
        .from("ai_apply_outputs")
        .select("id, stored_url, view, attempt_index, status, look_id")
        .in("job_id", currentBatchJobIds)
        .order("created_at", { ascending: true });

      if (outputs) {
        setOutputCounts({
          completed: outputs.filter(o => o.status === "completed").length,
          failed: outputs.filter(o => o.status === "failed").length,
          pending: outputs.filter(o => o.status === "pending").length,
          generating: outputs.filter(o => o.status === "generating").length,
        });
        
        const completedWithImages = outputs
          .filter(o => o.status === "completed" && o.stored_url)
          .map(o => ({
            id: o.id,
            stored_url: o.stored_url!,
            view: o.view,
            attempt_index: o.attempt_index ?? 0,
            status: o.status ?? "pending",
            look_id: o.look_id ?? "",
          }));
        setGeneratedOutputs(completedWithImages);
      }
    };

    fetchOutputs();
    const interval = setInterval(fetchOutputs, 2000);
    return () => clearInterval(interval);
  }, [currentBatchJobIds]);

  // Check for job completion
  useEffect(() => {
    if (!isGenerating || currentBatchJobIds.length === 0) return;

    const checkJobs = async () => {
      const { data: jobs } = await supabase
        .from("ai_apply_jobs")
        .select("id, status")
        .in("id", currentBatchJobIds);

      if (jobs) {
        const allDone = jobs.every(j => j.status === "completed" || j.status === "failed");
        if (allDone) {
          setIsGenerating(false);
          refreshTracking();
          toast({ 
            title: "Generation complete", 
            description: `Generated ${outputCounts.completed} images` 
          });
        }
      }
    };

    const interval = setInterval(checkJobs, 3000);
    return () => clearInterval(interval);
  }, [isGenerating, currentBatchJobIds, outputCounts.completed, refreshTracking, toast]);

  // Selection handlers
  const toggleLookSelection = useCallback((lookId: string) => {
    setSelectedLookIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lookId)) {
        newSet.delete(lookId);
      } else {
        newSet.add(lookId);
      }
      return newSet;
    });
  }, []);

  const selectAllLooks = useCallback(() => {
    setSelectedLookIds(new Set(filteredLooks.map(l => l.lookId)));
  }, [filteredLooks]);

  const deselectAllLooks = useCallback(() => {
    setSelectedLookIds(new Set());
  }, []);

  const selectNeedsGeneration = useCallback(() => {
    const needsGen = looks.filter(l => l.needsGeneration);
    setSelectedLookIds(new Set(needsGen.map(l => l.lookId)));
  }, [looks]);

  const selectNew = useCallback(() => {
    const newLooks = looks.filter(l => l.isNewSinceLastRun);
    setSelectedLookIds(new Set(newLooks.map(l => l.lookId)));
  }, [looks]);

  const selectFailed = useCallback(() => {
    const failedLooks = looks.filter(l => l.views.some(v => v.failedCount > 0));
    setSelectedLookIds(new Set(failedLooks.map(l => l.lookId)));
  }, [looks]);

  // Start generation - only generates missing outputs
  const handleStartGeneration = async () => {
    const selectedLooks = looks.filter(l => selectedLookIds.has(l.lookId));
    if (selectedLooks.length === 0) {
      toast({ title: "No looks selected", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setLastRunTimestamp(new Date().toISOString());
    setCurrentBatchJobIds([]);

    try {
      const newBatchJobIds: string[] = [];

      for (const look of selectedLooks) {
        // Skip if no talent assigned
        if (!look.digitalTalentId) continue;

        // Determine which views need generation
        const viewsToGenerate = look.views.filter(v => 
          allowRegenerate || v.completedCount < attemptsPerView
        );

        if (viewsToGenerate.length === 0) continue;

        // Calculate how many outputs we actually need to generate
        const outputsNeeded = viewsToGenerate.reduce((sum, v) => {
          return sum + (allowRegenerate ? attemptsPerView : Math.max(0, attemptsPerView - v.completedCount));
        }, 0);

        if (outputsNeeded === 0) continue;

        // Auto-describe outfits
        const outfitDescriptions: Record<string, string> = {};
        
        for (const sourceImage of look.sourceImages) {
          const viewStat = viewsToGenerate.find(v => v.view === sourceImage.view);
          if (!viewStat) continue;

          const imageUrl = sourceImage.head_cropped_url || sourceImage.source_url;
          const response = await supabase.functions.invoke("generate-outfit-description", {
            body: { imageUrl },
          });
          if (response.data?.description) {
            outfitDescriptions[sourceImage.id] = response.data.description;
          }
        }

        // Create job
        const { data: newJob, error: jobError } = await supabase
          .from("ai_apply_jobs")
          .insert({
            project_id: projectId,
            look_id: look.lookId,
            digital_talent_id: look.digitalTalentId,
            attempts_per_view: attemptsPerView,
            model: selectedModel,
            total: outputsNeeded,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;
        newBatchJobIds.push(newJob.id);

        // Start generation
        const viewsToProcess = viewsToGenerate.map(v => v.view);
        
        await supabase.functions.invoke("generate-ai-apply", {
          body: {
            projectId: projectId,
            lookId: look.lookId,
            type: 'run',
            jobId: newJob.id,
            outfitDescriptions,
            views: viewsToProcess,
            attemptsPerView: attemptsPerView,
            model: selectedModel,
            allowRegenerate,
          },
        });
      }

      setCurrentBatchJobIds(newBatchJobIds);
      toast({ 
        title: "Generation started", 
        description: `Processing ${selectedLooks.length} looks` 
      });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Cancel generation
  const handleCancelGeneration = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    try {
      await supabase
        .from("ai_apply_jobs")
        .update({ status: "canceled" })
        .in("id", currentBatchJobIds);
      
      await supabase
        .from("ai_apply_outputs")
        .delete()
        .in("job_id", currentBatchJobIds)
        .in("status", ["pending", "generating", "queued"]);
      
      setIsGenerating(false);
      refreshTracking();
      toast({ title: "Generation canceled" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Retry failed
  const handleRetryFailed = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      await supabase
        .from("ai_apply_outputs")
        .delete()
        .in("job_id", currentBatchJobIds)
        .eq("status", "failed");

      for (const jobId of currentBatchJobIds) {
        await supabase
          .from("ai_apply_jobs")
          .update({ status: "pending" })
          .eq("id", jobId);

        await supabase.functions.invoke("generate-ai-apply", {
          body: { jobId, resume: true },
        });
      }

      toast({ title: "Retrying failed outputs" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Regenerate a specific view
  const handleRegenerateView = async (view: string) => {
    const selectedLooks = looks.filter(l => selectedLookIds.has(l.lookId) && l.digitalTalentId);
    if (selectedLooks.length === 0) return;

    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      const newBatchJobIds: string[] = [];

      for (const look of selectedLooks) {
        const { data: newJob, error: jobError } = await supabase
          .from("ai_apply_jobs")
          .insert({
            project_id: projectId,
            look_id: look.lookId,
            digital_talent_id: look.digitalTalentId,
            attempts_per_view: attemptsPerView,
            model: selectedModel,
            total: attemptsPerView,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;
        newBatchJobIds.push(newJob.id);

        await supabase.functions.invoke("generate-ai-apply", {
          body: {
            jobId: newJob.id,
            views: [view],
            attemptsPerView,
          },
        });
      }

      setCurrentBatchJobIds(newBatchJobIds);
      toast({ title: `Regenerating ${VIEW_LABELS[view] || view}` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const hasRunningJobs = isGenerating && currentBatchJobIds.length > 0;
  const canGenerate = selectedLookIds.size > 0 && 
    generationPlan.outputsToGenerate > 0 && 
    faceFoundations.length > 0 &&
    !isGenerating;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader message="Loading generation data..." />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Settings row */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                  disabled={isGenerating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Options per View</label>
                <Select
                  value={String(attemptsPerView)}
                  onValueChange={(v) => setAttemptsPerView(Number(v))}
                  disabled={isGenerating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTEMPT_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={String(opt)}>
                        {opt} {opt === 1 ? "option" : "options"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <p className="text-2xl font-bold text-primary">
                  {summary.viewsComplete} / {summary.totalViews}
                  <span className="text-sm font-normal text-muted-foreground ml-2">views complete</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Smart selection toolbar */}
        <SmartSelectionToolbar
          onSelectAll={selectAllLooks}
          onDeselectAll={deselectAllLooks}
          onSelectNeedsGeneration={selectNeedsGeneration}
          onSelectNew={selectNew}
          onSelectFailed={selectFailed}
          selectedCount={selectedLookIds.size}
          totalCount={filteredLooks.length}
          needsGenerationCount={summary.looksNeedGeneration}
          newCount={summary.looksNew}
          failedCount={filterCounts.failed}
          disabled={isGenerating}
          filterMode={filterMode}
          onFilterChange={setFilterMode}
          filterCounts={filterCounts}
        />

        {/* Looks grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredLooks.map((look) => (
            <LookGenerationCard
              key={look.lookId}
              look={look}
              requiredOptions={attemptsPerView}
              isSelected={selectedLookIds.has(look.lookId)}
              onToggleSelect={toggleLookSelection}
              disabled={isGenerating}
            />
          ))}
        </div>

        {filteredLooks.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {filterMode === 'needs_generation' 
              ? "All looks are fully generated! Switch to 'Show All' to see them."
              : "No looks match this filter."}
          </div>
        )}

        {/* Generation plan preview */}
        {selectedLookIds.size > 0 && (
          <GenerationPlanPreview
            selectedLooksCount={generationPlan.selectedLooksCount}
            totalViewsToGenerate={generationPlan.totalViewsToGenerate}
            outputsToGenerate={generationPlan.outputsToGenerate}
            existingOutputsCount={generationPlan.existingOutputsCount}
            allowRegenerate={allowRegenerate}
            onAllowRegenerateChange={setAllowRegenerate}
            requiredOptions={attemptsPerView}
            isGenerating={isGenerating}
          />
        )}

        {/* Progress panel */}
        <GenerationProgressPanel
          isGenerating={isGenerating}
          progress={outputCounts.completed}
          total={generationPlan.outputsToGenerate}
          completedCount={outputCounts.completed}
          failedCount={outputCounts.failed}
          pendingCount={outputCounts.pending}
          runningCount={outputCounts.generating}
          elapsedTime={elapsedDisplay}
          lastActivitySeconds={lastActivitySeconds}
          currentProcessingInfo="Processing..."
          onCancel={handleCancelGeneration}
          onRetryFailed={handleRetryFailed}
        />

        {/* Generated images gallery */}
        {generatedOutputs.length > 0 && (
          <GeneratedImagesGallery
            outputs={generatedOutputs}
            isGenerating={isGenerating}
            onRegenerateView={handleRegenerateView}
          />
        )}

        {/* Generate button */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleStartGeneration}
          disabled={!canGenerate}
        >
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <LeapfrogLoader message="" size="sm" />
              <span>Generating...</span>
            </div>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              {generationPlan.outputsToGenerate > 0 
                ? `Generate ${generationPlan.outputsToGenerate} Outputs`
                : "Start Generation"
              }
            </>
          )}
        </Button>

        {faceFoundations.length === 0 && (
          <p className="text-sm text-yellow-600 text-center">
            No face foundations found. Create them in Talent Face Library first.
          </p>
        )}

        {/* Continue button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={summary.looksComplete === 0}
            onClick={onContinue}
          >
            Continue to Review
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Talent reference sidebar */}
      <div className="w-48 flex-shrink-0">
        <div className="sticky top-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Talent Reference</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {talentInfo?.front_face_url ? (
                <img
                  src={talentInfo.front_face_url}
                  alt={talentInfo.name}
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <p className="text-center text-sm font-medium mt-2">
                {talentInfo?.name || "No talent"}
              </p>

              {faceFoundations.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Face Foundations</p>
                  <div className="grid grid-cols-3 gap-1">
                    {faceFoundations.slice(0, 6).map((f) => (
                      <img
                        key={f.id}
                        src={f.stored_url}
                        alt={f.view}
                        className="w-full aspect-square object-cover rounded"
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
