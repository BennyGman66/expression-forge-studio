import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import { DEFAULT_AI_APPLY_SETTINGS } from "@/types/ai-apply";
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
  const { toast } = useToast();

  // Data hook
  const { 
    looks, 
    sourceImages,
    talentInfo, 
    isLoading,
    refetch 
  } = useAIApplyData({ projectId });

  // Queue hook with fixed settings
  const {
    isProcessing,
    addToQueue,
  } = useAIApplyQueue({ projectId, onComplete: refetch });

  // Get current selection
  const currentLook = looks.find(l => l.id === selectedLookId) || null;
  const currentViewStatus = currentLook && selectedView 
    ? currentLook.views[selectedView] 
    : null;

  // Get body image URL for current view
  const bodyImageUrl = currentViewStatus?.pairing?.bodyImage?.url || null;

  // Handle view selection
  const handleSelectView = (lookId: string, view: string) => {
    setSelectedLookId(lookId);
    setSelectedView(view);
  };

  // Handle running current view
  const handleRunView = useCallback(() => {
    if (!currentLook || !selectedView) return;
    
    const added = addToQueue('run', currentLook.id, currentLook.name, selectedView, DEFAULT_AI_APPLY_SETTINGS.attemptsPerView);
    if (added) {
      toast({ title: "Started", description: `${VIEW_LABELS[selectedView as ViewType]} generation started` });
    } else {
      toast({ title: "Already Running", description: "This view is already in the queue", variant: "destructive" });
    }
  }, [currentLook, selectedView, addToQueue, toast]);

  // Handle run all views for current look
  const handleRunAll = useCallback(() => {
    if (!currentLook) return;

    const viewsToRun = VIEW_TYPES.filter(v => 
      currentLook.views[v]?.pairing?.canRun && 
      currentLook.views[v]?.status === 'not_started'
    );

    let addedCount = 0;
    for (const view of viewsToRun) {
      const added = addToQueue('run', currentLook.id, currentLook.name, view, DEFAULT_AI_APPLY_SETTINGS.attemptsPerView);
      if (added) addedCount++;
    }

    toast({ 
      title: "Started", 
      description: `${addedCount} views queued for generation` 
    });
  }, [currentLook, addToQueue, toast]);

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
      description: isCurrentlySelected ? "Selection cleared" : "Output selected as best" 
    });
    refetch();
  }, [currentViewStatus, refetch, toast]);

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
      <div className="w-56 flex-shrink-0">
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
        onRun={handleRunView}
        onSelectOutput={handleSelectOutput}
        isRunning={isProcessing}
      />

      {/* RIGHT: Actions Panel */}
      <AIApplyActionsPanel
        look={currentLook}
        talentName={talentInfo?.name || null}
        talentImageUrl={currentViewStatus?.pairing?.headRender?.url || null}
        bodyImageUrl={bodyImageUrl}
        selectedView={selectedView}
        onRunView={handleRunView}
        onRunAll={handleRunAll}
        onSendToJobBoard={handleSendToJobBoard}
        isRunning={isProcessing}
      />
    </div>
  );
}