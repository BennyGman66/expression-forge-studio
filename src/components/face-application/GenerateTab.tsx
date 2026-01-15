import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, User, CheckCircle, XCircle, Clock, RefreshCw, Sparkles, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceApplicationJob, FaceFoundation, VIEW_LABELS } from "@/types/face-application";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface LookWithImages {
  id: string;
  name: string;
  digital_talent_id: string | null;
  sourceImages: LookSourceImage[];
}

interface GenerateTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
  selectedLookIds?: Set<string>;
  onContinue: () => void;
}

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
}

const ATTEMPT_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-flash-image-preview", label: "Nano Fast" },
  { value: "google/gemini-3-pro-image-preview", label: "Nano Pro" },
];

export function GenerateTab({ projectId, lookId, talentId, selectedLookIds, onContinue }: GenerateTabProps) {
  const [looks, setLooks] = useState<LookWithImages[]>([]);
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [attemptsPerView, setAttemptsPerView] = useState(4);
  const [selectedModel, setSelectedModel] = useState("google/gemini-3-pro-image-preview");
  const [jobs, setJobs] = useState<FaceApplicationJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [talentInfo, setTalentInfo] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const [talentIds, setTalentIds] = useState<string[]>([]);
  const [currentBatchJobIds, setCurrentBatchJobIds] = useState<string[]>([]);
  const [generationStartTime, setGenerationStartTime] = useState<Date | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState("");
  const [lastActivitySeconds, setLastActivitySeconds] = useState<number | null>(null);
  const [outputCounts, setOutputCounts] = useState<OutputCounts>({ completed: 0, failed: 0, pending: 0, generating: 0 });
  const [generatedOutputs, setGeneratedOutputs] = useState<GeneratedOutput[]>([]);
  const [persistedOutputs, setPersistedOutputs] = useState<GeneratedOutput[]>([]);
  const [excludedImageIds, setExcludedImageIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Toggle image selection for generation
  const toggleImageSelection = (imageId: string) => {
    setExcludedImageIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  // Get all source images and calculate included ones
  const allSourceImages = useMemo(() => looks.flatMap(l => l.sourceImages), [looks]);
  const includedSourceImages = useMemo(() => 
    allSourceImages.filter(img => !excludedImageIds.has(img.id)), 
    [allSourceImages, excludedImageIds]
  );

  // Fetch ALL looks for this PROJECT with their source images
  useEffect(() => {
    if (!projectId) return;
    const fetchLooks = async () => {
      const { data: looksData } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id")
        .eq("project_id", projectId)
        .order("created_at");

      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setTalentIds([]);
        return;
      }

      // Filter by selectedLookIds if provided
      const filteredLooksData = selectedLookIds && selectedLookIds.size > 0
        ? looksData.filter(l => selectedLookIds.has(l.id))
        : looksData;

      // Extract unique talent IDs
      const uniqueTalentIds = [...new Set(filteredLooksData.map(l => l.digital_talent_id).filter(Boolean))] as string[];
      setTalentIds(uniqueTalentIds);

      // For each look, fetch source images with crops
      const looksWithImages: LookWithImages[] = [];
      for (const look of filteredLooksData) {
        const { data: images } = await supabase
          .from("look_source_images")
          .select("*")
          .eq("look_id", look.id)
          .not("head_cropped_url", "is", null)
          .order("view");

        if (images && images.length > 0) {
          looksWithImages.push({
            id: look.id,
            name: look.name,
            digital_talent_id: look.digital_talent_id,
            sourceImages: images as LookSourceImage[],
          });
        }
      }
      setLooks(looksWithImages);
    };
    fetchLooks();
  }, [projectId, selectedLookIds]);

  // Fetch talent info from first talent
  useEffect(() => {
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
  }, [talentIds]);

  // Fetch face foundations for talents
  useEffect(() => {
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
  }, [talentIds]);

  // Fetch existing jobs for this project
  useEffect(() => {
    if (!projectId) return;
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);
    };
    fetchJobs();
  }, [projectId]);

  // Fetch existing completed outputs for current looks (persistence across sessions)
  useEffect(() => {
    if (looks.length === 0) {
      setPersistedOutputs([]);
      return;
    }

    const fetchExistingOutputs = async () => {
      const lookIds = looks.map(l => l.id);
      
      // Get all jobs for these looks
      const { data: jobsForLooks } = await supabase
        .from("face_application_jobs")
        .select("id")
        .in("look_id", lookIds);
      
      if (!jobsForLooks || jobsForLooks.length === 0) {
        setPersistedOutputs([]);
        return;
      }

      const jobIds = jobsForLooks.map(j => j.id);
      
      // Get all completed outputs for these jobs
      const { data: outputs } = await supabase
        .from("face_application_outputs")
        .select("id, stored_url, view, attempt_index, status, job_id")
        .in("job_id", jobIds)
        .eq("status", "completed")
        .not("stored_url", "is", null)
        .order("created_at", { ascending: true });

      if (outputs) {
        const existingOutputs = outputs.map(o => ({
          id: o.id,
          stored_url: o.stored_url!,
          view: o.view,
          attempt_index: o.attempt_index ?? 0,
          status: o.status ?? "completed",
        }));
        setPersistedOutputs(existingOutputs);
      }
    };

    fetchExistingOutputs();
  }, [looks]);

  // Poll for job updates
  useEffect(() => {
    const runningJobs = jobs.filter(j => j.status === "running" || j.status === "pending");
    if (runningJobs.length === 0) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (data) {
        setJobs(data as unknown as FaceApplicationJob[]);
        const stillRunning = data.some(j => j.status === "running" || j.status === "pending");
        if (!stillRunning) {
          setIsGenerating(false);
          const allCompleted = data.every(j => j.status === "completed");
          if (allCompleted) {
            toast({ title: "Generation complete", description: "All faces have been generated." });
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs, projectId, toast]);

  // Elapsed time counter effect
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

  // Last activity tracker effect
  useEffect(() => {
    if (!isGenerating || currentBatchJobIds.length === 0) {
      setLastActivitySeconds(null);
      return;
    }
    const interval = setInterval(() => {
      const currentBatchJobs = jobs.filter(j => currentBatchJobIds.includes(j.id));
      if (currentBatchJobs.length === 0) return;
      const latestUpdate = Math.max(...currentBatchJobs.map(j => new Date(j.updated_at).getTime()));
      const seconds = Math.floor((Date.now() - latestUpdate) / 1000);
      setLastActivitySeconds(seconds);
    }, 1000);
    return () => clearInterval(interval);
  }, [isGenerating, currentBatchJobIds, jobs]);

  // Poll for output counts and generated images when we have batch jobs
  useEffect(() => {
    if (currentBatchJobIds.length === 0) {
      setOutputCounts({ completed: 0, failed: 0, pending: 0, generating: 0 });
      setGeneratedOutputs([]);
      return;
    }

    const fetchOutputs = async () => {
      const { data: outputs } = await supabase
        .from("face_application_outputs")
        .select("id, stored_url, view, attempt_index, status")
        .in("job_id", currentBatchJobIds)
        .order("created_at", { ascending: true });

      if (outputs) {
        // Update counts
        setOutputCounts({
          completed: outputs.filter(o => o.status === "completed").length,
          failed: outputs.filter(o => o.status === "failed").length,
          pending: outputs.filter(o => o.status === "pending").length,
          generating: outputs.filter(o => o.status === "generating").length,
        });
        
        // Store completed outputs with images for preview
        const completedWithImages = outputs
          .filter(o => o.status === "completed" && o.stored_url)
          .map(o => ({
            id: o.id,
            stored_url: o.stored_url!,
            view: o.view,
            attempt_index: o.attempt_index ?? 0,
            status: o.status ?? "pending",
          }));
        setGeneratedOutputs(completedWithImages);
      }
    };

    fetchOutputs();
    const interval = setInterval(fetchOutputs, 2000);
    return () => clearInterval(interval);
  }, [currentBatchJobIds, jobs]);

  // Combine persisted outputs with current batch outputs (deduplicated)
  const allOutputs = useMemo(() => {
    const outputMap = new Map<string, GeneratedOutput>();
    
    // Add persisted outputs first
    persistedOutputs.forEach(o => outputMap.set(o.id, o));
    
    // Add/overwrite with current batch outputs (they may have updated status)
    generatedOutputs.forEach(o => outputMap.set(o.id, o));
    
    return Array.from(outputMap.values());
  }, [persistedOutputs, generatedOutputs]);

  // Get current processing info
  const getCurrentProcessingInfo = () => {
    if (batchProgress === 0 || batchTotal === 0) return "Starting...";
    const views = ['Front', 'Cropped Front', 'Back', 'Detail'];
    const viewIndex = Math.floor(batchProgress / attemptsPerView) % views.length;
    const attemptIndex = (batchProgress % attemptsPerView) + 1;
    const viewName = views[viewIndex] || `View ${viewIndex + 1}`;
    return `${viewName} (attempt ${attemptIndex} of ${attemptsPerView})`;
  };

  // Get activity status color
  const getActivityStatusColor = () => {
    if (lastActivitySeconds === null) return "bg-muted";
    if (lastActivitySeconds < 30) return "bg-green-500";
    if (lastActivitySeconds < 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  // Cancel generation and clear queue
  const handleCancelGeneration = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    try {
      // Update all current batch jobs to canceled
      await supabase
        .from("face_application_jobs")
        .update({ status: "canceled" })
        .in("id", currentBatchJobIds);
      
      // Delete any pending/generating outputs
      await supabase
        .from("face_application_outputs")
        .delete()
        .in("job_id", currentBatchJobIds)
        .in("status", ["pending", "generating"]);
      
      setIsGenerating(false);
      toast({ title: "Generation canceled", description: "The queue has been cleared." });
      
      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Retry only failed outputs
  const handleRetryFailed = async () => {
    if (currentBatchJobIds.length === 0) return;
    
    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      // Delete failed outputs so resume regenerates them
      await supabase
        .from("face_application_outputs")
        .delete()
        .in("job_id", currentBatchJobIds)
        .eq("status", "failed");

      // Reset job status and resume each job
      for (const jobId of currentBatchJobIds) {
        await supabase
          .from("face_application_jobs")
          .update({ status: "pending" })
          .eq("id", jobId);

        await supabase.functions.invoke("generate-face-application", {
          body: { jobId, resume: true },
        });
      }

      toast({ title: "Retrying failed outputs", description: "Regenerating only the failed images." });

      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Regenerate a specific view only
  const handleRegenerateView = async (view: string) => {
    if (looks.length === 0 || talentIds.length === 0) return;
    
    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      const newBatchJobIds: string[] = [];

      for (const look of looks) {
        const talentId = look.digital_talent_id || talentIds[0];
        
        // Find source image for this view
        const viewImage = look.sourceImages.find(img => img.view === view);
        if (!viewImage) continue;
        
        // Auto-describe outfit for this view
        const outfitDescriptions: Record<string, string> = {};
        const imageToDescribe = viewImage.head_cropped_url || viewImage.source_url;
        const response = await supabase.functions.invoke("generate-outfit-description", {
          body: { imageUrl: imageToDescribe },
        });
        if (response.data?.description) {
          outfitDescriptions[viewImage.id] = response.data.description;
        }

        // Create job for single view
        const { data: newJob, error: jobError } = await supabase
          .from("face_application_jobs")
          .insert({
            project_id: projectId,
            look_id: look.id,
            digital_talent_id: talentId,
            attempts_per_view: attemptsPerView,
            model: selectedModel,
            total: attemptsPerView,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;
        newBatchJobIds.push(newJob.id);

        // Trigger generation for single view only
        await supabase.functions.invoke("generate-face-application", {
          body: {
            jobId: newJob.id,
            outfitDescriptions,
            singleView: view,
          },
        });
      }

      setCurrentBatchJobIds(newBatchJobIds);
      toast({ 
        title: `Regenerating ${VIEW_LABELS[view] || view}`, 
        description: `Creating ${attemptsPerView} new options.` 
      });

      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Generate more options (fresh batch, keeps existing outputs)
  const handleRegenerateAll = async () => {
    if (looks.length === 0 || talentIds.length === 0) return;
    
    // Filter looks to only include those with included images
    const looksToProcess = looks.map(look => ({
      ...look,
      sourceImages: look.sourceImages.filter(img => !excludedImageIds.has(img.id))
    })).filter(look => look.sourceImages.length > 0);

    if (looksToProcess.length === 0) {
      toast({ title: "No images selected", description: "Please select at least one image to generate.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGenerationStartTime(new Date());

    try {
      const newBatchJobIds: string[] = [];

      for (const look of looksToProcess) {
        const talentId = look.digital_talent_id || talentIds[0];
        
        // Auto-describe outfits
        const outfitDescriptions: Record<string, string> = {};
        
        toast({ title: "Analyzing outfits...", description: `Processing ${look.name}` });
        
        const results = await Promise.all(
          look.sourceImages.map(async (img) => {
            const imageToDescribe = img.head_cropped_url || img.source_url;
            const response = await supabase.functions.invoke("generate-outfit-description", {
              body: { imageUrl: imageToDescribe },
            });
            return {
              id: img.id,
              description: response.data?.description || null,
            };
          })
        );
        
        results.forEach(({ id, description }) => {
          if (description) outfitDescriptions[id] = description;
        });

        // Create NEW job for fresh batch
        const { data: newJob, error: jobError } = await supabase
          .from("face_application_jobs")
          .insert({
            project_id: projectId,
            look_id: look.id,
            digital_talent_id: talentId,
            attempts_per_view: attemptsPerView,
            model: selectedModel,
            total: look.sourceImages.length * attemptsPerView,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;
        
        newBatchJobIds.push(newJob.id);

        await supabase.functions.invoke("generate-face-application", {
          body: {
            jobId: newJob.id,
            outfitDescriptions,
          },
        });
      }

      setCurrentBatchJobIds(newBatchJobIds);

      toast({ title: "Generating more options", description: "Creating a fresh batch of images." });

      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Auto-describe and start generation for all looks
  const handleStartGeneration = async () => {
    if (looks.length === 0 || talentIds.length === 0) return;
    
    // Filter looks to only include those with included images
    const looksToProcess = looks.map(look => ({
      ...look,
      sourceImages: look.sourceImages.filter(img => !excludedImageIds.has(img.id))
    })).filter(look => look.sourceImages.length > 0);

    if (looksToProcess.length === 0) {
      toast({ title: "No images selected", description: "Please select at least one image to generate.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setGenerationStartTime(new Date());
    setCurrentBatchJobIds([]); // Reset current batch

    try {
      const newBatchJobIds: string[] = [];
      // Create jobs for each look
      for (const look of looksToProcess) {
        const talentId = look.digital_talent_id || talentIds[0];
        
        // Auto-describe outfits for this look's images
        const outfitDescriptions: Record<string, string> = {};
        
        toast({ title: "Analyzing outfits...", description: `Processing ${look.name}` });
        
        // Describe in parallel - use CROPPED image for outfit description
        const results = await Promise.all(
          look.sourceImages.map(async (img) => {
            // Use the cropped head image to describe outfit (visible clothing)
            const imageToDescribe = img.head_cropped_url || img.source_url;
            const response = await supabase.functions.invoke("generate-outfit-description", {
              body: { imageUrl: imageToDescribe },
            });
            return {
              id: img.id,
              description: response.data?.description || null,
            };
          })
        );
        
        results.forEach(({ id, description }) => {
          if (description) outfitDescriptions[id] = description;
        });

        // Create job - edge function will handle face foundation matching from database
        const { data: newJob, error: jobError } = await supabase
          .from("face_application_jobs")
          .insert({
            project_id: projectId,
            look_id: look.id,
            digital_talent_id: talentId,
            attempts_per_view: attemptsPerView,
            model: selectedModel,
            total: look.sourceImages.length * attemptsPerView,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;
        
        newBatchJobIds.push(newJob.id);

        // Trigger generation - face matching is now handled by edge function
        await supabase.functions.invoke("generate-face-application", {
          body: {
            jobId: newJob.id,
            outfitDescriptions,
          },
        });
      }

      // Set the current batch job IDs for progress tracking
      setCurrentBatchJobIds(newBatchJobIds);

      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Calculate totals - only for current batch when generating
  const totalGenerations = includedSourceImages.length * attemptsPerView;
  
  // Filter to current batch jobs for progress display
  const currentBatchJobs = currentBatchJobIds.length > 0 
    ? jobs.filter(j => currentBatchJobIds.includes(j.id))
    : [];
  const batchProgress = currentBatchJobs.reduce((sum, j) => sum + (j.progress || 0), 0);
  const batchTotal = currentBatchJobs.reduce((sum, j) => sum + (j.total || 0), 0);
  const overallProgress = batchTotal > 0 ? (batchProgress / batchTotal) * 100 : 0;
  
  const allJobsCompleted = jobs.length > 0 && jobs.every(j => j.status === "completed");
  const hasRunningJobs = jobs.some(j => j.status === "running" || j.status === "pending");
  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Pre-generation overview */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {looks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No looks with cropped images found. Complete head crops first.
              </p>
            ) : (
              <div className="space-y-6">
                {/* Settings */}
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
                    <label className="text-sm font-medium">Total Generations</label>
                    <p className="text-3xl font-bold text-primary">{totalGenerations}</p>
                    <p className="text-xs text-muted-foreground">
                      {looks.length} look{looks.length !== 1 ? "s" : ""} • {includedSourceImages.length} view{includedSourceImages.length !== 1 ? "s" : ""} × {attemptsPerView} each
                      {excludedImageIds.size > 0 && (
                        <span className="text-amber-600"> ({excludedImageIds.size} excluded)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Looks grid preview with selectable images */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Looks to Generate</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExcludedImageIds(new Set())}
                        disabled={isGenerating || excludedImageIds.size === 0}
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExcludedImageIds(new Set(allSourceImages.map(i => i.id)))}
                        disabled={isGenerating || excludedImageIds.size === allSourceImages.length}
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {looks.map((look) => (
                      <div key={look.id} className="border rounded-lg p-3 bg-muted/30">
                        <p className="font-medium text-sm mb-2">{look.name}</p>
                        <div className="flex gap-2 flex-wrap">
                          {look.sourceImages.map((img) => {
                            const isExcluded = excludedImageIds.has(img.id);
                            return (
                              <button
                                key={img.id}
                                onClick={() => toggleImageSelection(img.id)}
                                className="relative group cursor-pointer"
                                disabled={isGenerating}
                                type="button"
                              >
                                <img
                                  src={img.head_cropped_url || img.source_url}
                                  alt={img.view}
                                  className={cn(
                                    "w-14 h-14 object-cover rounded border transition-opacity",
                                    isExcluded && "opacity-40"
                                  )}
                                />
                                {/* Checkmark overlay */}
                                <div className={cn(
                                  "absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all",
                                  isExcluded 
                                    ? "bg-muted border-2 border-dashed border-muted-foreground/40" 
                                    : "bg-emerald-500"
                                )}>
                                  {!isExcluded && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <span className={cn(
                                  "absolute -bottom-1 left-0 right-0 text-[9px] text-center capitalize bg-background/80 rounded-b",
                                  isExcluded && "text-muted-foreground"
                                )}>
                                  {img.view}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress */}
                {hasRunningJobs && currentBatchJobIds.length > 0 && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <LeapfrogLoader message="" size="sm" />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Generating faces...</span>
                          <span className="font-medium">{batchProgress} / {batchTotal}</span>
                        </div>
                        <Progress value={overallProgress} className="h-2" />
                      </div>
                      {/* Cancel button */}
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleCancelGeneration}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                    
                    {/* Live output counts */}
                    <div className="flex items-center gap-4 text-xs pt-2 border-t border-border/50">
                      {outputCounts.completed > 0 && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          {outputCounts.completed} done
                        </span>
                      )}
                      {outputCounts.failed > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle className="w-3 h-3" />
                          {outputCounts.failed} failed
                        </span>
                      )}
                      {(outputCounts.pending + outputCounts.generating) > 0 && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {outputCounts.pending + outputCounts.generating} remaining
                        </span>
                      )}
                    </div>

                    {/* Activity indicators */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                      <span className="text-foreground/80">
                        Processing: {getCurrentProcessingInfo()}
                      </span>
                      <div className="flex items-center gap-3">
                        {elapsedDisplay && (
                          <span>Elapsed: {elapsedDisplay}</span>
                        )}
                        {lastActivitySeconds !== null && (
                          <span className="flex items-center gap-1.5">
                            Last activity: {lastActivitySeconds}s ago
                            <span className={`w-2 h-2 rounded-full ${getActivityStatusColor()} animate-pulse`} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Generated Images Preview */}
                {allOutputs.length > 0 && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Generated Images</h4>
                      <span className="text-xs text-muted-foreground">
                        {allOutputs.length} images
                      </span>
                    </div>
                    
                    {/* Group by view */}
                    <div className="space-y-4">
                      {Object.entries(
                        allOutputs.reduce((acc, output) => {
                          const viewKey = output.view || 'unknown';
                          if (!acc[viewKey]) acc[viewKey] = [];
                          acc[viewKey].push(output);
                          return acc;
                        }, {} as Record<string, GeneratedOutput[]>)
                      ).map(([view, outputs]) => (
                        <div key={view} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground">
                              {VIEW_LABELS[view] || view} ({outputs.length})
                            </p>
                            {/* Per-view regenerate button */}
                            {!isGenerating && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleRegenerateView(view)}
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Regenerate {VIEW_LABELS[view] || view}
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {outputs.map((output) => (
                              <div 
                                key={output.id} 
                                className="relative group"
                              >
                                <img
                                  src={output.stored_url}
                                  alt={`${view} attempt ${output.attempt_index + 1}`}
                                  className="w-20 h-20 object-cover rounded-lg border transition-transform hover:scale-105"
                                />
                                <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/60 text-white rounded-b-lg py-0.5">
                                  #{output.attempt_index + 1}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons - show when we have outputs or failed items */}
                    {!isGenerating && allOutputs.length > 0 && (
                      <div className="flex gap-2 pt-3 border-t border-border/50">
                        {outputCounts.failed > 0 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={handleRetryFailed}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Retry Failed ({outputCounts.failed})
                          </Button>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={handleRegenerateAll}
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate More Options
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStartGeneration}
                  disabled={looks.length === 0 || isGenerating || faceFoundations.length === 0}
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-2">
                      <LeapfrogLoader message="" size="sm" />
                      <span>Generating...</span>
                    </div>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Generation
                    </>
                  )}
                </Button>

                {faceFoundations.length === 0 && (
                  <p className="text-sm text-yellow-600 text-center">
                    No face foundations found. Create them in Talent Face Library first.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Continue Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={!allJobsCompleted}
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

              {/* Face foundations preview */}
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
