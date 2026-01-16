import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, User, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
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
import { LiveGenerationFeed } from "./LiveGenerationFeed";

// Helper to chunk arrays for large queries
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

const CHUNK_SIZE = 30; // Safe size for Supabase .in() queries

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
  const [setupPhase, setSetupPhase] = useState(false);
  const [setupProgress, setSetupProgress] = useState({ current: 0, total: 0 });
  
  // Job-level progress tracking
  const [jobStatusCounts, setJobStatusCounts] = useState({ 
    total: 0, queued: 0, running: 0, done: 0, failed: 0, partial: 0 
  });
  
  // Auxiliary data
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [talentInfo, setTalentInfo] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const [lastRunTimestamp, setLastRunTimestamp] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // Persistent active requests tracker for the processing loop
  const activeRequestsRef = useRef(new Set<string>());
  
  const { toast } = useToast();

  // Restore active generation state on mount (handles tab switching)
  useEffect(() => {
    const restoreActiveGeneration = async () => {
      // Query for any running/pending jobs for this project
      const { data: activeJobs, error } = await supabase
        .from("ai_apply_jobs")
        .select("id, created_at, status")
        .eq("project_id", projectId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: true });

      if (error || !activeJobs || activeJobs.length === 0) {
        return; // No active generation to restore
      }

      // Restore the generation state
      const jobIds = activeJobs.map(j => j.id);
      setCurrentBatchJobIds(jobIds);
      setIsGenerating(true);
      
      // Use the earliest job's created_at for the timer
      const earliestJob = activeJobs[0];
      if (earliestJob?.created_at) {
        setGenerationStartTime(new Date(earliestJob.created_at));
      }

      toast({
        title: "Generation in progress",
        description: `Reconnected to ${activeJobs.length} active jobs`,
      });
    };

    restoreActiveGeneration();
  }, [projectId, toast]);

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

  // Poll for output counts when generating - with chunked queries
  useEffect(() => {
    if (currentBatchJobIds.length === 0) {
      return;
    }

    const fetchOutputs = async () => {
      try {
        const chunks = chunkArray(currentBatchJobIds, CHUNK_SIZE);
        const allOutputs: any[] = [];

        for (const chunk of chunks) {
          const { data: outputs, error } = await supabase
            .from("ai_apply_outputs")
            .select("id, stored_url, view, attempt_index, status, look_id")
            .in("job_id", chunk)
            .order("created_at", { ascending: true });

          if (error) {
            console.error("Error fetching outputs chunk:", error);
            setFetchError(`Error fetching outputs: ${error.message}`);
            return;
          }

          if (outputs) {
            allOutputs.push(...outputs);
          }
        }

        setFetchError(null);
        setOutputCounts({
          completed: allOutputs.filter(o => o.status === "completed").length,
          failed: allOutputs.filter(o => o.status === "failed").length,
          pending: allOutputs.filter(o => o.status === "pending").length,
          generating: allOutputs.filter(o => o.status === "generating").length,
        });
        
        const completedWithImages = allOutputs
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
      } catch (error: any) {
        console.error("Error in fetchOutputs:", error);
        setFetchError(`Error fetching outputs: ${error.message}`);
      }
    };

    fetchOutputs();
    const interval = setInterval(fetchOutputs, 2000);
    return () => clearInterval(interval);
  }, [currentBatchJobIds]);

  // Check for job completion AND track job-level progress - with chunked queries
  useEffect(() => {
    if (currentBatchJobIds.length === 0) {
      // Reset job status counts when no active batch
      setJobStatusCounts({ total: 0, queued: 0, running: 0, done: 0, failed: 0, partial: 0 });
      return;
    }

    const checkJobs = async () => {
      try {
        const chunks = chunkArray(currentBatchJobIds, CHUNK_SIZE);
        const allJobs: any[] = [];

        for (const chunk of chunks) {
          const { data: jobs, error } = await supabase
            .from("ai_apply_jobs")
            .select("id, status")
            .in("id", chunk);

          if (error) {
            console.error("Error checking jobs chunk:", error);
            return;
          }

          if (jobs) {
            allJobs.push(...jobs);
          }
        }

        // Compute job-level status counts
        const counts = {
          total: allJobs.length,
          queued: allJobs.filter(j => j.status === "pending").length,
          running: allJobs.filter(j => j.status === "running").length,
          done: allJobs.filter(j => j.status === "completed").length,
          failed: allJobs.filter(j => j.status === "failed").length,
          partial: allJobs.filter(j => j.status === "partial").length,
        };
        setJobStatusCounts(counts);

        // Check if all done
        if (isGenerating) {
          const allDone = allJobs.length > 0 && allJobs.every(j => 
            j.status === "completed" || j.status === "failed" || j.status === "partial"
          );
          if (allDone) {
            setIsGenerating(false);
            refreshTracking();
            toast({ 
              title: "Generation complete", 
              description: `Completed ${counts.done} jobs (${counts.failed} failed)` 
            });
          }
        }
      } catch (error) {
        console.error("Error in checkJobs:", error);
      }
    };

    checkJobs(); // Run immediately
    const interval = setInterval(checkJobs, 2000);
    return () => clearInterval(interval);
  }, [isGenerating, currentBatchJobIds, refreshTracking, toast]);

  // Continuous processing loop - re-invoke edge function for pending outputs
  // This is needed because the edge function processes only ONE output per invocation
  useEffect(() => {
    if (!isGenerating || currentBatchJobIds.length === 0 || setupPhase) return;

    let isProcessing = false;
    const maxConcurrent = 3;

    const processPendingOutputs = async () => {
      if (isProcessing) return;
      isProcessing = true;

      try {
        // Use chunked queries to find pending outputs
        const chunks = chunkArray(currentBatchJobIds, CHUNK_SIZE);
        const allPendingOutputs: any[] = [];

        for (const chunk of chunks) {
          const { data: pendingOutputs, error } = await supabase
            .from("ai_apply_outputs")
            .select("id, job_id, look_id, view")
            .in("job_id", chunk)
            .eq("status", "pending")
            .limit(10); // Limit per chunk

          if (error) {
            console.error("Error fetching pending outputs chunk:", error);
            continue;
          }

          if (pendingOutputs) {
            allPendingOutputs.push(...pendingOutputs);
          }
          
          // Stop early if we have enough
          if (allPendingOutputs.length >= maxConcurrent * 2) break;
        }

        if (allPendingOutputs.length === 0) {
          isProcessing = false;
          return;
        }

        // Group by look_id + view to avoid duplicate requests
        const lookViewPairs = new Map<string, { lookId: string; view: string; jobId: string }>();
        for (const output of allPendingOutputs) {
          const key = `${output.look_id}-${output.view}`;
          if (!lookViewPairs.has(key) && !activeRequestsRef.current.has(key)) {
            lookViewPairs.set(key, {
              lookId: output.look_id!,
              view: output.view,
              jobId: output.job_id!,
            });
          }
        }

        // Limit concurrent requests using the ref
        const availableSlots = maxConcurrent - activeRequestsRef.current.size;
        const pairsToProcess = Array.from(lookViewPairs.values()).slice(0, availableSlots);

        // Invoke edge function for each pending look/view pair
        for (const pair of pairsToProcess) {
          const requestKey = `${pair.lookId}-${pair.view}`;
          activeRequestsRef.current.add(requestKey);

          console.log(`[Processing Loop] Invoking generate-ai-apply for ${pair.lookId}/${pair.view}`);

          supabase.functions.invoke("generate-ai-apply", {
            body: {
              projectId,
              lookId: pair.lookId,
              type: 'run',
              jobId: pair.jobId,
              views: [pair.view],
              model: selectedModel,
            },
          }).then((result) => {
            if (result.error) {
              console.error(`[Processing Loop] Edge function error for ${pair.lookId}/${pair.view}:`, result.error);
            }
          }).finally(() => {
            activeRequestsRef.current.delete(requestKey);
          });
        }

        // Track last activity
        if (pairsToProcess.length > 0) {
          setLastActivitySeconds(0);
        }
      } catch (error) {
        console.error("Error processing pending outputs:", error);
      } finally {
        isProcessing = false;
      }
    };

    // Run every 3 seconds to pick up new pending outputs
    const interval = setInterval(processPendingOutputs, 3000);
    // Also run immediately
    processPendingOutputs();

    return () => clearInterval(interval);
  }, [isGenerating, currentBatchJobIds, setupPhase, projectId, selectedModel]);

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

  // Preflight check: verify prerequisites for selected looks
  const checkPrerequisites = useCallback(async (selectedLooks: LookGenerationStats[]) => {
    const issues: { lookName: string; view: string; issue: string }[] = [];
    let readyViews = 0;
    let totalViews = 0;

    for (const look of selectedLooks) {
      for (const sourceImage of look.sourceImages) {
        totalViews++;
        const hasHeadCrop = !!sourceImage.head_cropped_url;
        const hasMatchedFace = !!sourceImage.matched_face_url;

        if (!hasHeadCrop) {
          issues.push({
            lookName: look.lookName,
            view: sourceImage.view,
            issue: 'Missing Head Crop',
          });
        } else if (!hasMatchedFace) {
          issues.push({
            lookName: look.lookName,
            view: sourceImage.view,
            issue: 'Missing Face Match',
          });
        } else {
          readyViews++;
        }
      }
    }

    return { issues, readyViews, totalViews };
  }, []);

  // Start generation - only generates missing outputs
  const handleStartGeneration = async () => {
    const selectedLooks = looks.filter(l => selectedLookIds.has(l.lookId));
    if (selectedLooks.length === 0) {
      toast({ title: "No looks selected", variant: "destructive" });
      return;
    }

    // Preflight check: verify all prerequisites are met
    const { issues, readyViews, totalViews } = await checkPrerequisites(selectedLooks);
    
    if (issues.length > 0) {
      // Group issues by type
      const headCropMissing = issues.filter(i => i.issue === 'Missing Head Crop');
      const faceMatchMissing = issues.filter(i => i.issue === 'Missing Face Match');
      
      let description = '';
      if (headCropMissing.length > 0) {
        description += `${headCropMissing.length} views missing Head Crops. `;
      }
      if (faceMatchMissing.length > 0) {
        description += `${faceMatchMissing.length} views missing Face Match. `;
      }
      description += `Only ${readyViews}/${totalViews} views are ready.`;

      toast({ 
        title: "Prerequisites incomplete", 
        description,
        variant: "destructive" 
      });

      // If nothing is ready, don't start at all
      if (readyViews === 0) {
        return;
      }
    }

    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setLastRunTimestamp(new Date().toISOString());
    setCurrentBatchJobIds([]);
    setSetupPhase(true);
    setSetupProgress({ current: 0, total: selectedLooks.length });

    try {
      let lookIndex = 0;
      let jobsCreated = 0;
      
      for (const look of selectedLooks) {
        lookIndex++;
        // Skip if no talent assigned
        if (!look.digitalTalentId) {
          console.log(`[Generate] Skipping look ${look.lookName}: No talent assigned`);
          continue;
        }

        // Check if this look has any views with prerequisites met
        const readySourceImages = look.sourceImages.filter(
          img => img.head_cropped_url && img.matched_face_url
        );
        
        if (readySourceImages.length === 0) {
          console.log(`[Generate] Skipping look ${look.lookName}: No views with prerequisites`);
          continue;
        }

        // Determine which views need generation AND have prerequisites
        const viewsToGenerate = look.views.filter(v => {
          const sourceImage = look.sourceImages.find(img => img.view === v.view);
          const hasPrereqs = sourceImage?.head_cropped_url && sourceImage?.matched_face_url;
          const needsGen = allowRegenerate || v.completedCount < attemptsPerView;
          return hasPrereqs && needsGen;
        });

        if (viewsToGenerate.length === 0) {
          console.log(`[Generate] Skipping look ${look.lookName}: All ready views already complete`);
          continue;
        }

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
        
        // Add job ID immediately to enable progress tracking
        setCurrentBatchJobIds(prev => [...prev, newJob.id]);
        setSetupProgress({ current: lookIndex, total: selectedLooks.length });
        jobsCreated++;

        // Start generation - fire and forget (no await)
        const viewsToProcess = viewsToGenerate.map(v => v.view);
        
        console.log(`[Generate] Starting job ${newJob.id} for look ${look.lookName} with ${viewsToProcess.length} views`);
        
        supabase.functions.invoke("generate-ai-apply", {
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

      setSetupPhase(false);
      
      if (jobsCreated === 0) {
        setIsGenerating(false);
        toast({ 
          title: "No generation needed", 
          description: "All selected looks are either missing prerequisites or already complete.",
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Generation started", 
          description: `Processing ${jobsCreated} looks (${selectedLooks.length - jobsCreated} skipped due to missing prerequisites)` 
        });
      }

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Cancel generation - with chunked queries
  const handleCancelGeneration = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    try {
      const chunks = chunkArray(currentBatchJobIds, CHUNK_SIZE);
      
      for (const chunk of chunks) {
        await supabase
          .from("ai_apply_jobs")
          .update({ status: "canceled" })
          .in("id", chunk);
        
        await supabase
          .from("ai_apply_outputs")
          .delete()
          .in("job_id", chunk)
          .in("status", ["pending", "generating", "queued"]);
      }
      
      setIsGenerating(false);
      refreshTracking();
      toast({ title: "Generation canceled" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Resume generation - creates missing outputs AND processes pending ones
  const handleResumePending = async () => {
    // Find looks with incomplete views (views that have source images but 0 outputs)
    const looksNeedingWork = looks.filter(l => 
      l.digitalTalentId && l.views.some(v => v.completedCount < attemptsPerView)
    );

    if (looksNeedingWork.length === 0) {
      toast({ title: "All views are complete!" });
      return;
    }

    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setCurrentBatchJobIds([]);

    let totalCreated = 0;
    const newJobIds: string[] = [];

    try {
      for (const look of looksNeedingWork) {
        // Get or create a job for this look
        let { data: existingJob } = await supabase
          .from("ai_apply_jobs")
          .select("id")
          .eq("project_id", projectId)
          .eq("look_id", look.lookId)
          .maybeSingle();

        let jobId: string;
        if (!existingJob) {
          const { data: newJob, error } = await supabase
            .from("ai_apply_jobs")
            .insert({
              project_id: projectId,
              look_id: look.lookId,
              digital_talent_id: look.digitalTalentId,
              attempts_per_view: attemptsPerView,
              model: selectedModel,
              status: "running",
            })
            .select()
            .single();
          
          if (error) throw error;
          jobId = newJob.id;
        } else {
          jobId = existingJob.id;
          await supabase
            .from("ai_apply_jobs")
            .update({ status: "running" })
            .eq("id", jobId);
        }

        newJobIds.push(jobId);

        // Invoke edge function - it will create missing outputs and process them
        supabase.functions.invoke("generate-ai-apply", {
          body: {
            projectId,
            lookId: look.lookId,
            type: 'run',
            model: selectedModel,
            attemptsPerView,
          },
        });
        totalCreated++;
      }

      setCurrentBatchJobIds(newJobIds);
      toast({ 
        title: "Resuming generation", 
        description: `Processing ${looksNeedingWork.length} looks with missing views` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Retry failed - with chunked queries
  const handleRetryFailed = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      const chunks = chunkArray(currentBatchJobIds, CHUNK_SIZE);
      
      for (const chunk of chunks) {
        await supabase
          .from("ai_apply_outputs")
          .delete()
          .in("job_id", chunk)
          .eq("status", "failed");
      }

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

        {/* Error alert */}
        {fetchError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{fetchError}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setFetchError(null)}
                className="ml-4"
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress panel - uses job-level progress when batch is active, falls back to output-level */}
        <GenerationProgressPanel
          isGenerating={isGenerating}
          progress={jobStatusCounts.total > 0 ? jobStatusCounts.done + jobStatusCounts.partial : outputCounts.completed}
          total={jobStatusCounts.total > 0 ? jobStatusCounts.total : outputCounts.completed + outputCounts.failed + outputCounts.pending + outputCounts.generating}
          completedCount={jobStatusCounts.total > 0 ? jobStatusCounts.done : outputCounts.completed}
          failedCount={jobStatusCounts.total > 0 ? jobStatusCounts.failed : outputCounts.failed}
          pendingCount={jobStatusCounts.total > 0 ? jobStatusCounts.queued : outputCounts.pending}
          runningCount={jobStatusCounts.total > 0 ? jobStatusCounts.running : outputCounts.generating}
          elapsedTime={elapsedDisplay}
          lastActivitySeconds={lastActivitySeconds}
          currentProcessingInfo={
            jobStatusCounts.total > 0 
              ? `${jobStatusCounts.running} jobs generating, ${jobStatusCounts.queued} queued`
              : `${outputCounts.generating} generating, ${outputCounts.pending} queued`
          }
          onCancel={handleCancelGeneration}
          onRetryFailed={handleRetryFailed}
          setupPhase={setupPhase}
          setupProgress={setupProgress}
        />

        {/* Live generation feed - shows images streaming in */}
        <LiveGenerationFeed
          projectId={projectId}
          isGenerating={isGenerating}
          onCleanupStalled={(stalledIds) => {
            refreshTracking();
          }}
        />

        {/* Generate button */}
        <div className="flex gap-3">
          <Button
            size="lg"
            className="flex-1"
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
          
          {/* Resume/Fill Missing button */}
          <Button
            size="lg"
            variant="outline"
            onClick={handleResumePending}
            disabled={isGenerating}
            title="Create and process outputs for any views showing 0/0"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Fill Missing
          </Button>
        </div>

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
