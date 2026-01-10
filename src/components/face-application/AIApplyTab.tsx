import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_AI_APPLY_SETTINGS } from "@/types/ai-apply";
import { useAIApplyData } from "@/hooks/useAIApplyData";
import { useAIApplyQueue } from "@/hooks/useAIApplyQueue";
import { BatchBar } from "./ai-apply/BatchBar";
import { ViewSelector } from "./ai-apply/ViewSelector";
import { ContextPreview } from "./ai-apply/ContextPreview";
import { QueuePanel } from "./ai-apply/QueuePanel";
import { ReviewDialog } from "./ai-apply/ReviewDialog";

interface AIApplyTabProps {
  projectId: string;
}

export function AIApplyTab({ projectId }: AIApplyTabProps) {
  // Default prompt
  const DEFAULT_PROMPT = `Apply the provided head/face to the body while maintaining exact clothing, pose, and proportions. Preserve facial identity precisely. Output should be photorealistic and seamless.`;

  // Batch selection state
  const [selectedViews, setSelectedViews] = useState<Set<string>>(new Set());
  const [hoveredView, setHoveredView] = useState<{ lookId: string; view: string } | null>(null);
  const [attemptsPerView, setAttemptsPerView] = useState(DEFAULT_AI_APPLY_SETTINGS.attemptsPerView);
  const [model, setModel] = useState(DEFAULT_AI_APPLY_SETTINGS.model);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  const { toast } = useToast();

  // Data hook
  const { 
    looks, 
    isLoading,
    refetch 
  } = useAIApplyData({ projectId });

  // Queue hook
  const {
    queue,
    isProcessing,
    addToQueue,
    removeFromQueue,
    clearQueue,
  } = useAIApplyQueue({ projectId, onComplete: refetch });

  // Toggle a single view
  const handleToggleView = useCallback((lookId: string, view: string) => {
    const viewId = `${lookId}:${view}`;
    setSelectedViews(prev => {
      const next = new Set(prev);
      if (next.has(viewId)) {
        next.delete(viewId);
      } else {
        next.add(viewId);
      }
      return next;
    });
  }, []);

  // Toggle all views in a look
  const handleToggleLook = useCallback((lookId: string) => {
    const look = looks.find(l => l.id === lookId);
    if (!look) return;

    const lookViewIds = Object.keys(look.views).map(v => `${lookId}:${v}`);
    const allSelected = lookViewIds.every(id => selectedViews.has(id));

    setSelectedViews(prev => {
      const next = new Set(prev);
      if (allSelected) {
        // Deselect all
        lookViewIds.forEach(id => next.delete(id));
      } else {
        // Select all
        lookViewIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [looks, selectedViews]);

  // Select all views
  const handleSelectAll = useCallback(() => {
    const allViewIds = looks.flatMap(look => 
      Object.keys(look.views).map(v => `${look.id}:${v}`)
    );
    
    const allSelected = allViewIds.every(id => selectedViews.has(id));
    
    if (allSelected) {
      setSelectedViews(new Set());
    } else {
      setSelectedViews(new Set(allViewIds));
    }
  }, [looks, selectedViews]);

  // Select views by type
  const handleSelectByType = useCallback((viewType: string) => {
    const viewIdsOfType = looks.flatMap(look => 
      Object.keys(look.views)
        .filter(v => v === viewType)
        .map(v => `${look.id}:${v}`)
    );

    setSelectedViews(prev => {
      const next = new Set(prev);
      // Add all of this type
      viewIdsOfType.forEach(id => next.add(id));
      return next;
    });
  }, [looks]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedViews(new Set());
  }, []);

  // Run batch - queue all selected views
  const handleRunBatch = useCallback(() => {
    if (selectedViews.size === 0) return;

    let addedCount = 0;
    
    selectedViews.forEach(viewId => {
      const [lookId, view] = viewId.split(':');
      const look = looks.find(l => l.id === lookId);
      if (!look) return;

      const viewStatus = look.views[view];
      if (!viewStatus?.pairing?.canRun) return;

      const added = addToQueue('run', lookId, look.name, view, attemptsPerView);
      if (added) addedCount++;
    });

    if (addedCount > 0) {
      toast({
        title: "Batch Started",
        description: `${addedCount} views queued for generation (${addedCount * attemptsPerView} total renders)`,
      });
      // Clear selection after queueing
      setSelectedViews(new Set());
    } else {
      toast({
        title: "No Views Queued",
        description: "Selected views may already be running or not ready",
        variant: "destructive",
      });
    }
  }, [selectedViews, looks, attemptsPerView, addToQueue, toast]);

  // Retry a failed item
  const handleRetryItem = useCallback((item: typeof queue[0]) => {
    const look = looks.find(l => l.id === item.lookId);
    if (!look || !item.view) return;

    addToQueue('retry_failed', item.lookId, look.name, item.view, attemptsPerView);
    removeFromQueue(item.id);
  }, [looks, attemptsPerView, addToQueue, removeFromQueue]);

  // Cancel batch
  const handleCancelBatch = useCallback(() => {
    clearQueue();
    toast({ title: "Batch Cancelled" });
  }, [clearQueue, toast]);

  // Send to job board
  const handleSendToJobBoard = useCallback(() => {
    toast({ 
      title: "Coming Soon", 
      description: "Job Board integration will be available in the next update" 
    });
  }, [toast]);

  // Handle hover
  const handleHoverView = useCallback((view: { lookId: string; view: string } | null) => {
    setHoveredView(view);
  }, []);

  // Check if any outputs exist
  const hasOutputs = useMemo(() => {
    return looks.some(look => 
      Object.values(look.views).some(v => v.outputs.length > 0)
    );
  }, [looks]);

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

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] rounded-lg border bg-card overflow-hidden">
      {/* STICKY BATCH BAR */}
      <BatchBar
        selectedCount={selectedViews.size}
        attemptsPerView={attemptsPerView}
        model={model}
        onAttemptsChange={setAttemptsPerView}
        onModelChange={setModel}
        onRunBatch={handleRunBatch}
        onClearSelection={handleClearSelection}
        onOpenReview={() => setIsReviewOpen(true)}
        isRunning={isProcessing}
        hasOutputs={hasOutputs}
      />

      {/* MAIN 3-COLUMN LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: View Selector */}
        <div className="w-64 flex-shrink-0">
          <ViewSelector
            looks={looks}
            selectedViews={selectedViews}
            hoveredView={hoveredView}
            onToggleView={handleToggleView}
            onToggleLook={handleToggleLook}
            onSelectAll={handleSelectAll}
            onSelectByType={handleSelectByType}
            onHoverView={handleHoverView}
          />
        </div>

        {/* CENTER: Context Preview */}
        <ContextPreview
          hoveredView={hoveredView}
          looks={looks}
          onRefetch={refetch}
        />

        {/* RIGHT: Queue Panel */}
        <QueuePanel
          queue={queue}
          selectedViews={selectedViews}
          prompt={prompt}
          onPromptChange={setPrompt}
          onRemoveFromQueue={removeFromQueue}
          onRetryItem={handleRetryItem}
          onCancelBatch={handleCancelBatch}
          onSendToJobBoard={handleSendToJobBoard}
        />
      </div>

      {/* Review Dialog */}
      <ReviewDialog
        open={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        looks={looks}
        onRefetch={refetch}
      />
    </div>
  );
}
