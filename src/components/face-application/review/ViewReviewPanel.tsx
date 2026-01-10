import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { 
  Check, Loader2, RefreshCw, AlertCircle, StopCircle, Play, X, ChevronLeft, ChevronRight 
} from "lucide-react";
import { VIEW_LABELS, ViewType, ViewStatus } from "@/types/face-application";
import { cn } from "@/lib/utils";

interface ViewReviewPanelProps {
  lookName: string;
  view: string;
  viewStatus: ViewStatus | null;
  bodyImageUrl: string | null;
  headReferenceUrl: string | null;
  hasHeadCrop?: boolean;
  onSelectAttempt: (outputId: string) => void;
  onRegenerateView: () => void;
  onCancelView: () => void;
  onGenerateView?: () => void;
  isCanceling: boolean;
  pendingCount?: number;
}

export function ViewReviewPanel({
  lookName,
  view,
  viewStatus,
  bodyImageUrl,
  headReferenceUrl,
  hasHeadCrop = true,
  onSelectAttempt,
  onRegenerateView,
  onCancelView,
  onGenerateView,
  isCanceling,
  pendingCount = 0,
}: ViewReviewPanelProps) {
  const outputs = viewStatus?.outputs || [];
  const selectedOutput = outputs.find(o => o.is_selected);
  const isRunning = viewStatus?.status === 'running';
  const completedOutputs = outputs.filter(o => o.status === 'completed' && o.stored_url);
  const failedOutputs = outputs.filter(o => o.status === 'failed');
  const runningOutputs = outputs.filter(o => o.status === 'generating' || o.status === 'pending');

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = (outputId: string) => {
    const index = completedOutputs.findIndex(o => o.id === outputId);
    if (index !== -1) {
      setLightboxIndex(index);
      setLightboxOpen(true);
    }
  };

  const handlePrevious = useCallback(() => {
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : completedOutputs.length - 1));
  }, [completedOutputs.length]);

  const handleNext = useCallback(() => {
    setLightboxIndex(prev => (prev < completedOutputs.length - 1 ? prev + 1 : 0));
  }, [completedOutputs.length]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        setLightboxOpen(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        const output = completedOutputs[lightboxIndex];
        if (output) onSelectAttempt(output.id);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, lightboxIndex, handlePrevious, handleNext, completedOutputs, onSelectAttempt]);

  const currentLightboxOutput = completedOutputs[lightboxIndex];

  const getStatusBadge = () => {
    if (!viewStatus) return null;
    
    switch (viewStatus.status) {
      case 'not_started':
        return <Badge variant="outline" className="text-muted-foreground">Not Started</Badge>;
      case 'running':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />Running
        </Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
          <Check className="h-3 w-3 mr-1" />Completed
        </Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />Failed
        </Badge>;
      case 'needs_selection':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />Needs Selection
        </Badge>;
    }
  };

  if (!viewStatus) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Select a view from the left panel to review</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">
            {lookName} — <span className="capitalize">{VIEW_LABELS[view as ViewType] || view}</span>
          </h2>
          {getStatusBadge()}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelView}
              disabled={isCanceling}
            >
              {isCanceling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <StopCircle className="h-4 w-4 mr-2" />
              )}
              Cancel
            </Button>
          )}
          {outputs.length === 0 && onGenerateView ? (
            <Button
              size="sm"
              onClick={onGenerateView}
              disabled={!hasHeadCrop}
              title={!hasHeadCrop ? "Head crop required - crop in Head Crop tab first" : undefined}
            >
              <Play className="h-4 w-4 mr-2" />
              {!hasHeadCrop ? "Needs Head Crop" : pendingCount > 0 ? "Add to Queue" : "Generate View"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerateView}
              disabled={isRunning || outputs.length === 0}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {pendingCount > 0 ? "Add to Queue" : "Regenerate View"}
            </Button>
          )}
        </div>
      </div>

      {/* Reference images - fixed at top */}
      <div className="p-4 border-b bg-muted/30">
        <div className="text-xs text-muted-foreground mb-2 font-medium">Reference Images</div>
        <div className="flex gap-4">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Body</div>
            <div className="w-20 h-20 rounded border overflow-hidden bg-background">
              {bodyImageUrl ? (
                <img src={bodyImageUrl} alt="Body reference" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Head</div>
            <div className="w-20 h-20 rounded border overflow-hidden bg-background">
              {headReferenceUrl ? (
                <img src={headReferenceUrl} alt="Head reference" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Attempts grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="text-xs text-muted-foreground mb-3 font-medium">
          Attempts ({completedOutputs.length} completed, {runningOutputs.length} running, {failedOutputs.length} failed)
        </div>

        {outputs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No attempts yet for this view.</p>
            <p className="text-sm mt-1">Generate from the Generate tab to create outputs.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {outputs.map((output, idx) => {
              const isSelected = output.is_selected;
              const isComplete = output.status === 'completed' && output.stored_url;
              const isRunning = output.status === 'generating' || output.status === 'pending';
              const isFailed = output.status === 'failed';

              return (
                <div
                  key={output.id}
                  className={cn(
                    "relative group rounded-lg overflow-hidden border-2 transition-all",
                    isSelected 
                      ? "border-primary ring-2 ring-primary/30" 
                      : "border-transparent hover:border-muted-foreground/30",
                    !isComplete && "opacity-60"
                  )}
                >
                  {/* Image or placeholder */}
                  <div className="aspect-square bg-muted">
                    {isRunning ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Generating...</span>
                      </div>
                    ) : isFailed ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="h-6 w-6 text-red-500" />
                        <span className="text-xs text-red-500">Failed</span>
                      </div>
                    ) : output.stored_url ? (
                      <img
                        src={output.stored_url}
                        alt={`Attempt ${idx + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => openLightbox(output.id)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">No image</span>
                      </div>
                    )}
                  </div>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-4 w-4" />
                    </div>
                  )}

                  {/* Attempt number */}
                  <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-xs font-medium">
                    #{idx + 1}
                  </div>

                  {/* Click to view hint on hover */}
                  {isComplete && (
                    <div
                      className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                      onClick={() => openLightbox(output.id)}
                    >
                      <span className="bg-background/90 text-foreground px-2 py-1 rounded text-xs font-medium">
                        Click to view
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 bg-black/95 border-none [&>button]:hidden">
          <div className="relative h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Attempt #{lightboxIndex + 1}</span>
                {currentLightboxOutput?.is_selected && (
                  <Badge className="bg-primary text-primary-foreground">
                    <Check className="h-3 w-3 mr-1" />
                    Selected
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/70">
                  {lightboxIndex + 1} / {completedOutputs.length}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setLightboxOpen(false)}
                  className="text-white hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Main image area with navigation */}
            <div className="flex-1 flex items-center justify-center relative px-16">
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handlePrevious}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>

              {currentLightboxOutput?.stored_url && (
                <img
                  src={currentLightboxOutput.stored_url}
                  alt={`Attempt ${lightboxIndex + 1}`}
                  className="max-h-full max-w-full object-contain"
                />
              )}

              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 text-white hover:bg-white/10 w-12 h-12"
                onClick={handleNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            </div>

            {/* Footer with selection toggle */}
            <div className="p-4 flex items-center justify-center gap-4">
              <Button
                variant={currentLightboxOutput?.is_selected ? "default" : "outline"}
                onClick={() => currentLightboxOutput && onSelectAttempt(currentLightboxOutput.id)}
                className={cn(
                  "gap-2",
                  currentLightboxOutput?.is_selected
                    ? "bg-primary text-primary-foreground"
                    : "border-white/30 text-white hover:bg-white/10"
                )}
              >
                <Check className="w-4 h-4" />
                {currentLightboxOutput?.is_selected ? 'Deselect' : 'Select'}
              </Button>
              <span className="text-xs text-white/50">Space to toggle • Arrow keys to navigate</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}