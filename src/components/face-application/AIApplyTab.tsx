import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplySettings } from "@/types/ai-apply";
import { useAIApplyData } from "@/hooks/useAIApplyData";
import { useAIApplyQueue } from "@/hooks/useAIApplyQueue";
import { AIApplyLooksList } from "./ai-apply/AIApplyLooksList";
import { AIApplyOutputPanel } from "./ai-apply/AIApplyOutputPanel";
import { AIApplyActionsPanel } from "./ai-apply/AIApplyActionsPanel";

interface AIApplyTabProps {
  projectId: string;
}

export function AIApplyTab({ projectId }: AIApplyTabProps) {
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Data hook
  const { 
    looks, 
    talentInfo, 
    isLoading,
    refetch 
  } = useAIApplyData({ projectId });

  // Queue hook
  const {
    queue,
    isProcessing,
    settings,
    setSettings,
    addToQueue,
    addBulkToQueue,
    pendingCount,
  } = useAIApplyQueue({ projectId, onComplete: refetch });

  // Get current selection
  const currentLook = looks.find(l => l.id === selectedLookId) || null;
  const currentViewStatus = currentLook && selectedView 
    ? currentLook.views[selectedView] 
    : null;

  // Handle view selection
  const handleSelectView = (lookId: string, view: string) => {
    setSelectedLookId(lookId);
    setSelectedView(view);
  };

  // Handle running a single view
  const handleRun = useCallback(() => {
    if (!currentLook || !selectedView) return;
    
    const added = addToQueue('run', currentLook.id, currentLook.name, selectedView, settings.attemptsPerView);
    if (added) {
      toast({ title: "Added to Queue", description: `${VIEW_LABELS[selectedView as ViewType]} queued for generation` });
    } else {
      toast({ title: "Already Queued", description: "This view is already in the queue", variant: "destructive" });
    }
  }, [currentLook, selectedView, addToQueue, settings.attemptsPerView, toast]);

  // Handle adding more attempts
  const handleAddMore = useCallback(() => {
    if (!currentLook || !selectedView) return;
    
    const added = addToQueue('add_more', currentLook.id, currentLook.name, selectedView, 2);
    if (added) {
      toast({ title: "Added to Queue", description: "2 more attempts queued" });
    }
  }, [currentLook, selectedView, addToQueue, toast]);

  // Handle retry failed
  const handleRetryFailed = useCallback(() => {
    if (!currentLook || !selectedView) return;
    
    const added = addToQueue('retry_failed', currentLook.id, currentLook.name, selectedView);
    if (added) {
      toast({ title: "Added to Queue", description: "Retry queued for failed attempts" });
    }
  }, [currentLook, selectedView, addToQueue, toast]);

  // Handle cancel view
  const handleCancel = useCallback(async () => {
    if (!currentViewStatus) return;

    for (const output of currentViewStatus.outputs) {
      if (output.status === 'pending' || output.status === 'generating') {
        await supabase
          .from('ai_apply_outputs')
          .update({ status: 'failed', error_message: 'Canceled by user' })
          .eq('id', output.id);
      }
    }
    
    toast({ title: "Canceled", description: "Generation canceled" });
    refetch();
  }, [currentViewStatus, refetch, toast]);

  // Handle output selection
  const handleSelectOutput = useCallback(async (outputId: string) => {
    if (!currentViewStatus) return;

    const clickedOutput = currentViewStatus.outputs.find(o => o.id === outputId);
    const isCurrentlySelected = clickedOutput?.is_selected;

    // Toggle selection - deselect all others in this view, toggle clicked one
    for (const output of currentViewStatus.outputs) {
      const shouldBeSelected = isCurrentlySelected
        ? false
        : output.id === outputId;
      
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: shouldBeSelected })
        .eq('id', output.id);
    }

    toast({ 
      title: isCurrentlySelected ? "Deselected" : "Selected", 
      description: isCurrentlySelected ? "Selection cleared" : "Output selected" 
    });
    refetch();
  }, [currentViewStatus, refetch, toast]);

  // Handle run all views for current look
  const handleRunAll = useCallback(() => {
    if (!currentLook) return;

    const viewsToRun = VIEW_TYPES.filter(v => 
      currentLook.views[v]?.pairing?.canRun && 
      currentLook.views[v]?.status === 'not_started'
    );

    let addedCount = 0;
    for (const view of viewsToRun) {
      const added = addToQueue('run', currentLook.id, currentLook.name, view, settings.attemptsPerView);
      if (added) addedCount++;
    }

    toast({ 
      title: "Added to Queue", 
      description: `${addedCount} views queued for generation` 
    });
  }, [currentLook, addToQueue, settings.attemptsPerView, toast]);

  // Handle save selections
  const handleSave = useCallback(async () => {
    if (!currentLook || !currentLook.isReady) return;

    setIsSaving(true);
    try {
      // Get selected outputs for each view
      const selectedOutputs = VIEW_TYPES
        .map(v => currentLook.views[v]?.outputs.find(o => o.is_selected))
        .filter(Boolean);

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
        if (output?.stored_url) {
          await supabase.from("talent_images").insert({
            talent_id: talentData.id,
            look_id: currentLook.id,
            view: output.view,
            stored_url: output.stored_url,
          });
        }
      }

      toast({ 
        title: "Saved", 
        description: `${selectedOutputs.length} views saved. Available in Avatar Repose.` 
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [currentLook, toast]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!currentLook) return;

    const selectedUrls = VIEW_TYPES
      .map(v => currentLook.views[v]?.outputs.find(o => o.is_selected)?.stored_url)
      .filter(Boolean);

    for (const url of selectedUrls) {
      window.open(url, '_blank');
    }
  }, [currentLook]);

  // Handle send to job board
  const handleSendToJobBoard = useCallback(() => {
    toast({ 
      title: "Coming Soon", 
      description: "Job Board integration will be available in the next update" 
    });
  }, [toast]);

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
            No looks ready for AI Apply. Complete the Review step first and select head renders.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Auto-select first look if none selected
  if (!selectedLookId && looks.length > 0) {
    setSelectedLookId(looks[0].id);
    setSelectedView(VIEW_TYPES[0]);
  }

  return (
    <div className="flex h-[calc(100vh-200px)] min-h-[600px] rounded-lg border bg-card overflow-hidden">
      {/* LEFT: Looks List */}
      <div className="w-64 flex-shrink-0">
        <AIApplyLooksList
          looks={looks}
          selectedLookId={selectedLookId}
          selectedView={selectedView}
          onSelectView={handleSelectView}
        />
      </div>

      {/* CENTER: Output Panel */}
      <AIApplyOutputPanel
        viewStatus={currentViewStatus}
        view={selectedView}
        lookName={currentLook?.name || ''}
        onRun={handleRun}
        onAddMore={handleAddMore}
        onRetryFailed={handleRetryFailed}
        onCancel={handleCancel}
        onSelectOutput={handleSelectOutput}
        isRunning={isProcessing}
      />

      {/* RIGHT: Actions Panel */}
      <AIApplyActionsPanel
        look={currentLook}
        talentName={talentInfo?.name || null}
        talentImageUrl={talentInfo?.front_face_url || null}
        settings={settings}
        onSettingsChange={setSettings}
        onRunAll={handleRunAll}
        onSave={handleSave}
        onDownload={handleDownload}
        onSendToJobBoard={handleSendToJobBoard}
        isSaving={isSaving}
        isRunningAll={isProcessing}
        pendingQueueCount={pendingCount}
      />
    </div>
  );
}
