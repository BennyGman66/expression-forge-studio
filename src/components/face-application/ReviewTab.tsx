import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { 
  FaceApplicationOutput, 
  LookWithViews, 
  VIEW_TYPES,
  VIEW_LABELS,
  ViewStatus,
  ViewType 
} from "@/types/face-application";
import { LookOverviewPanel } from "./review/LookOverviewPanel";
import { ViewReviewPanel } from "./review/ViewReviewPanel";
import { StatusRecoveryPanel } from "./review/StatusRecoveryPanel";
import { useGenerationQueue } from "@/hooks/useGenerationQueue";

interface ReviewTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
}

interface TalentInfo {
  name: string;
  front_face_url: string | null;
}

interface SourceImageInfo {
  id: string;
  look_id: string;
  view: string;
  source_url: string;
  head_cropped_url: string | null;
}

// Map legacy view names to new 4-view system
function mapLegacyView(newView: string): string[] {
  const mapping: Record<string, string[]> = {
    'full_front': ['full_front', 'front'],
    'cropped_front': ['cropped_front', 'side'],
    'back': ['back'],
    'detail': ['detail'],
  };
  return mapping[newView] || [newView];
}

// Calculate view status from outputs (handles legacy view names)
function calculateViewStatus(outputs: FaceApplicationOutput[], view: string): ViewStatus {
  // Match outputs with legacy view name support
  const legacyViews = mapLegacyView(view);
  const viewOutputs = outputs.filter(o => legacyViews.includes(o.view));
  const completed = viewOutputs.filter(o => o.status === 'completed' && o.stored_url);
  const failed = viewOutputs.filter(o => o.status === 'failed');
  const running = viewOutputs.filter(o => o.status === 'pending' || o.status === 'generating');
  const hasSelection = viewOutputs.some(o => o.is_selected);

  let status: ViewStatus['status'] = 'not_started';
  if (viewOutputs.length === 0) {
    status = 'not_started';
  } else if (running.length > 0) {
    status = 'running';
  } else if (failed.length > 0 && completed.length === 0) {
    status = 'failed';
  } else if (completed.length > 0 && !hasSelection) {
    status = 'needs_selection';
  } else if (completed.length > 0) {
    status = 'completed';
  }

  return {
    view,
    status,
    hasSelection,
    completedCount: completed.length,
    failedCount: failed.length,
    runningCount: running.length,
    totalAttempts: viewOutputs.length,
    outputs: viewOutputs,
  };
}

export function ReviewTab({ projectId }: ReviewTabProps) {
  const [looks, setLooks] = useState<LookWithViews[]>([]);
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [talentInfo, setTalentInfo] = useState<TalentInfo | null>(null);
  const [sourceImages, setSourceImages] = useState<SourceImageInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Generation queue hook
  const {
    queue,
    pendingCount,
    addToQueue,
    removeFromQueue,
    clearQueue,
    clearCompleted,
  } = useGenerationQueue({ 
    projectId, 
    onComplete: () => fetchData() 
  });

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    // Get ALL jobs for this project
    const { data: jobsData } = await supabase
      .from("face_application_jobs")
      .select("id, look_id, digital_talent_id, status, progress, total, updated_at")
      .eq("project_id", projectId);

    if (!jobsData || jobsData.length === 0) {
      setLooks([]);
      setIsLoading(false);
      return;
    }

    // Get talent info from first job
    const firstTalentId = jobsData[0].digital_talent_id;
    if (firstTalentId) {
      const { data: talent } = await supabase
        .from("digital_talents")
        .select("name, front_face_url")
        .eq("id", firstTalentId)
        .single();
      if (talent) setTalentInfo(talent);
    }

    // Get look names
    const lookIds = [...new Set(jobsData.map(j => j.look_id))];
    const { data: looksData } = await supabase
      .from("talent_looks")
      .select("id, name")
      .in("id", lookIds);

    const lookNameMap: Record<string, string> = {};
    looksData?.forEach(l => { lookNameMap[l.id] = l.name; });

    // Get all source images for these looks
    const { data: srcImages } = await supabase
      .from("look_source_images")
      .select("id, look_id, view, source_url, head_cropped_url")
      .in("look_id", lookIds);
    
    if (srcImages) {
      setSourceImages(srcImages);
    }

    // Get all outputs for these jobs
    const jobIds = jobsData.map(j => j.id);
    const { data: outputsData } = await supabase
      .from("face_application_outputs")
      .select("*")
      .in("job_id", jobIds)
      .order("view")
      .order("attempt_index");

    // Group outputs by look
    const outputsByLook: Record<string, FaceApplicationOutput[]> = {};
    for (const job of jobsData) {
      if (!outputsByLook[job.look_id]) {
        outputsByLook[job.look_id] = [];
      }
    }

    if (outputsData) {
      for (const output of outputsData) {
        const job = jobsData.find(j => j.id === output.job_id);
        if (job && outputsByLook[job.look_id]) {
          outputsByLook[job.look_id].push(output as FaceApplicationOutput);
        }
      }
    }

    // Build looks with view statuses
    const looksWithViews: LookWithViews[] = Object.entries(outputsByLook).map(([lookId, outputs]) => {
      const views: Record<string, ViewStatus> = {};
      
      // Calculate status for each view type
      for (const viewType of VIEW_TYPES) {
        views[viewType] = calculateViewStatus(outputs, viewType);
      }

      // Also check legacy views and map them
      const legacyViews = ['front', 'side', 'back'];
      for (const legacyView of legacyViews) {
        if (!views[legacyView]) {
          views[legacyView] = calculateViewStatus(outputs, legacyView);
        }
      }

      // Check if all 4 required views have selections
      const isReady = VIEW_TYPES.every(v => views[v]?.hasSelection);
      const isComplete = VIEW_TYPES.every(v => 
        views[v]?.status === 'completed' || views[v]?.status === 'needs_selection'
      );

      return {
        id: lookId,
        name: lookNameMap[lookId] || "Unknown Look",
        views,
        isReady,
        isComplete,
      };
    });

    setLooks(looksWithViews);
    setIsLoading(false);

    // Auto-select first look if none selected
    if (!selectedLookId && looksWithViews.length > 0) {
      setSelectedLookId(looksWithViews[0].id);
      // Find first view with outputs or first view type
      const firstLook = looksWithViews[0];
      const firstViewWithOutputs = VIEW_TYPES.find(v => 
        firstLook.views[v]?.totalAttempts > 0
      );
      setSelectedView(firstViewWithOutputs || VIEW_TYPES[0]);
    }
  }, [projectId, selectedLookId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Get current look and view status
  const currentLook = looks.find(l => l.id === selectedLookId) || null;
  const currentViewStatus = currentLook && selectedView 
    ? currentLook.views[selectedView] 
    : null;

  // Get source image for current view (with legacy view mapping)
  const currentSourceImage = sourceImages.find(
    s => s.look_id === selectedLookId && 
         mapLegacyView(selectedView || '').includes(s.view)
  );

  // Handle view selection from left panel
  const handleSelectView = (lookId: string, view: string) => {
    setSelectedLookId(lookId);
    setSelectedView(view);
  };

  // Handle attempt selection (toggle behavior - click again to deselect)
  const handleSelectAttempt = async (outputId: string) => {
    if (!currentViewStatus) return;

    const clickedOutput = currentViewStatus.outputs.find(o => o.id === outputId);
    const isCurrentlySelected = clickedOutput?.is_selected;

    // If already selected, deselect it; otherwise select this one and deselect others
    for (const output of currentViewStatus.outputs) {
      const shouldBeSelected = isCurrentlySelected
        ? false  // Deselect all when clicking the selected one
        : output.id === outputId;  // Select only the clicked one
      
      await supabase
        .from("face_application_outputs")
        .update({ is_selected: shouldBeSelected })
        .eq("id", output.id);
    }

    toast({ 
      title: isCurrentlySelected ? "Deselected" : "Selected", 
      description: isCurrentlySelected 
        ? "Selection cleared for this view" 
        : "Attempt selected for this view" 
    });
    fetchData();
  };

  // Handle regenerate view - add to queue
  const handleRegenerateView = () => {
    if (!currentLook || !selectedView || !currentViewStatus || currentViewStatus.outputs.length === 0) return;

    // Get job ID from existing job
    const outputIds = currentViewStatus.outputs.map(o => o.id);
    
    const added = addToQueue(
      'regenerate',
      currentLook.id,
      currentLook.name,
      selectedView,
      undefined,
      outputIds
    );

    if (added) {
      toast({ 
        title: "Added to Queue", 
        description: `${VIEW_LABELS[selectedView as ViewType] || selectedView} regeneration queued` 
      });
    } else {
      toast({ 
        title: "Already Queued", 
        description: "This view is already in the queue",
        variant: "destructive"
      });
    }
  };

  // Handle cancel view
  const handleCancelView = async () => {
    if (!currentViewStatus) return;

    setIsCanceling(true);
    
    try {
      // Mark pending/generating outputs as failed
      for (const output of currentViewStatus.outputs) {
        if (output.status === 'pending' || output.status === 'generating') {
          await supabase
            .from("face_application_outputs")
            .update({ status: 'failed' })
            .eq("id", output.id);
        }
      }
      toast({ title: "Canceled", description: "View generation canceled" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsCanceling(false);
    }
  };

  // Handle resume/retry failed
  const handleResumeView = async () => {
    if (!currentViewStatus) return;

    setIsResuming(true);
    
    try {
      // Delete failed outputs and regenerate
      const failedIds = currentViewStatus.outputs
        .filter(o => o.status === 'failed')
        .map(o => o.id);
      
      for (const id of failedIds) {
        await supabase
          .from("face_application_outputs")
          .delete()
          .eq("id", id);
      }
      
      // Trigger regeneration via job resume
      // This will detect missing outputs and regenerate them
      toast({ title: "Retrying", description: "Failed attempts will be regenerated" });
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
    setIsResuming(false);
  }
};

// Handle initial generation for a view with no attempts - add to queue
const handleGenerateView = () => {
  if (!currentLook || !selectedView || !currentSourceImage) return;

  // Validate head crop exists
  if (!currentSourceImage.head_cropped_url) {
    toast({ 
      title: "Cannot Generate", 
      description: "Head crop is required for this view. Please crop the head first in the Head Crop tab.",
      variant: "destructive"
    });
    return;
  }

  const added = addToQueue(
    'generate',
    currentLook.id,
    currentLook.name,
    selectedView
  );

  if (added) {
    toast({ 
      title: "Added to Queue", 
      description: `${VIEW_LABELS[selectedView as ViewType] || selectedView} generation queued` 
    });
  } else {
    toast({ 
      title: "Already Queued", 
      description: "This view is already in the queue",
      variant: "destructive"
    });
  }
};

// Handle save to look
  const handleSaveToLook = async () => {
    if (!currentLook || !currentLook.isReady) return;

    setIsSaving(true);
    
    try {
      // Get selected outputs for each view
      const selectedOutputs: FaceApplicationOutput[] = [];
      for (const viewType of VIEW_TYPES) {
        const viewStatus = currentLook.views[viewType];
        const selected = viewStatus?.outputs.find(o => o.is_selected);
        if (selected) {
          selectedOutputs.push(selected);
        }
      }

      // Get a talent_id from talents table for legacy compatibility
      const { data: talentData } = await supabase
        .from("talents")
        .select("id")
        .limit(1)
        .single();

      if (!talentData) {
        toast({ title: "Error", description: "No talent found", variant: "destructive" });
        return;
      }

      // Insert into talent_images
      for (const output of selectedOutputs) {
        await supabase.from("talent_images").insert({
          talent_id: talentData.id,
          look_id: currentLook.id,
          view: output.view,
          stored_url: output.stored_url,
        });
      }

      toast({ 
        title: "Saved", 
        description: `${selectedOutputs.length} views saved to look. Available in Avatar Repose.` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle download selected
  const handleDownloadSelected = async () => {
    if (!currentLook) return;

    const selectedUrls: string[] = [];
    for (const viewType of VIEW_TYPES) {
      const viewStatus = currentLook.views[viewType];
      const selected = viewStatus?.outputs.find(o => o.is_selected);
      if (selected?.stored_url) {
        selectedUrls.push(selected.stored_url);
      }
    }

    for (const url of selectedUrls) {
      window.open(url, '_blank');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (looks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No outputs yet. Complete the generation step first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] rounded-lg border bg-card overflow-hidden">
      {/* LEFT: Look Overview */}
      <div className="w-64 flex-shrink-0">
        <LookOverviewPanel
          looks={looks}
          selectedLookId={selectedLookId}
          selectedView={selectedView}
          onSelectView={handleSelectView}
        />
      </div>

      {/* CENTER: View Review */}
      <ViewReviewPanel
        lookName={currentLook?.name || ''}
        view={selectedView || ''}
        viewStatus={currentViewStatus}
        bodyImageUrl={currentSourceImage?.source_url || null}
        headReferenceUrl={currentSourceImage?.head_cropped_url || talentInfo?.front_face_url || null}
        hasHeadCrop={!!currentSourceImage?.head_cropped_url}
        onSelectAttempt={handleSelectAttempt}
        onRegenerateView={handleRegenerateView}
        onCancelView={handleCancelView}
        onGenerateView={handleGenerateView}
        isCanceling={isCanceling}
        pendingCount={pendingCount}
      />

      {/* RIGHT: Status & Recovery */}
      <StatusRecoveryPanel
        look={currentLook}
        selectedView={selectedView}
        viewStatus={currentViewStatus}
        talentName={talentInfo?.name || null}
        talentImageUrl={talentInfo?.front_face_url || null}
        onResumeView={handleResumeView}
        onSaveToLook={handleSaveToLook}
        onDownloadSelected={handleDownloadSelected}
        isResuming={isResuming}
        isSaving={isSaving}
        queue={queue}
        onRemoveFromQueue={removeFromQueue}
        onClearQueue={clearQueue}
        onClearCompleted={clearCompleted}
      />
    </div>
  );
}