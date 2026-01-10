import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { 
  Play, 
  Check, 
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplyViewStatus, AIApplyOutput } from "@/types/ai-apply";
import { cn } from "@/lib/utils";

interface AIApplyOutputPanelProps {
  viewStatus: AIApplyViewStatus | null;
  view: string | null;
  lookName: string;
  onRun: () => void;
  onSelectOutput: (outputId: string) => void;
  isRunning: boolean;
}

export function AIApplyOutputPanel({
  viewStatus,
  view,
  lookName,
  onRun,
  onSelectOutput,
  isRunning,
}: AIApplyOutputPanelProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!viewStatus || !view) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/20">
        <p className="text-muted-foreground">Select a look and view from the left panel</p>
      </div>
    );
  }

  const viewLabel = VIEW_LABELS[view as ViewType] || view;
  const completedOutputs = viewStatus.outputs.filter(o => o.status === 'completed' && o.stored_url);
  const hasOutputs = viewStatus.totalAttempts > 0;
  const canRun = viewStatus.pairing?.canRun ?? false;
  const hasRunning = viewStatus.runningCount > 0;

  // Get current output to display
  const currentOutput = completedOutputs[currentIndex] || null;
  const selectedOutput = completedOutputs.find(o => o.is_selected);

  const handlePrevious = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : completedOutputs.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev < completedOutputs.length - 1 ? prev + 1 : 0));
  };

  const handleSelectBest = () => {
    if (currentOutput) {
      onSelectOutput(currentOutput.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    else if (e.key === 'ArrowRight') handleNext();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleSelectBest();
    }
  };

  const getStatusBadge = () => {
    if (hasRunning) return { variant: 'secondary' as const, text: 'Running' };
    if (viewStatus.status === 'completed') return { variant: 'default' as const, text: 'Complete' };
    if (viewStatus.status === 'needs_selection') return { variant: 'outline' as const, text: 'Needs Selection' };
    if (viewStatus.status === 'failed') return { variant: 'destructive' as const, text: 'Failed' };
    return { variant: 'secondary' as const, text: 'Not Started' };
  };

  const statusBadge = getStatusBadge();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{lookName}</h3>
          <p className="text-sm text-muted-foreground">{viewLabel}</p>
        </div>
        <Badge variant={statusBadge.variant}>{statusBadge.text}</Badge>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasOutputs ? (
          /* Empty State - Run Button */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">No outputs generated yet</p>
              {!canRun && viewStatus.pairing?.missingRequirements[0] && (
                <p className="text-sm text-destructive">
                  {viewStatus.pairing.missingRequirements[0]}
                </p>
              )}
            </div>
            <Button 
              size="lg"
              onClick={onRun} 
              disabled={!canRun || isRunning}
              className="gap-2"
            >
              {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              Run 4 Attempts
            </Button>
          </div>
        ) : hasRunning && completedOutputs.length === 0 ? (
          /* Running State */
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Generating {viewStatus.runningCount} attempts...</p>
          </div>
        ) : (
          /* Large Image Viewer + Attempt Strip */
          <>
            {/* Large Image Viewer */}
            <div 
              className="flex-1 relative bg-muted/30 flex items-center justify-center cursor-pointer"
              onClick={() => currentOutput && setLightboxOpen(true)}
            >
              {currentOutput ? (
                <>
                  <img 
                    src={currentOutput.stored_url!}
                    alt={`Attempt ${currentIndex + 1}`}
                    className="max-h-full max-w-full object-contain"
                  />
                  
                  {/* Navigation arrows (only show if multiple outputs) */}
                  {completedOutputs.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleNext(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                    </>
                  )}

                  {/* Selection indicator on image */}
                  {currentOutput.is_selected && (
                    <div className="absolute top-4 right-4 bg-primary text-primary-foreground rounded-full p-2 shadow-lg">
                      <Check className="h-5 w-5" />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">No completed outputs yet</p>
              )}
            </div>

            {/* Horizontal Attempt Strip */}
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-3 justify-center mb-4">
                {completedOutputs.map((output, index) => (
                  <button
                    key={output.id}
                    onClick={() => setCurrentIndex(index)}
                    className={cn(
                      "relative w-16 h-20 rounded-lg overflow-hidden border-2 transition-all",
                      index === currentIndex 
                        ? "border-primary ring-2 ring-primary/20" 
                        : "border-transparent hover:border-muted-foreground/30",
                      output.is_selected && "ring-2 ring-green-500"
                    )}
                  >
                    <img 
                      src={output.stored_url!}
                      alt={`#${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <Badge 
                      variant="secondary"
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] px-1 py-0"
                    >
                      #{index + 1}
                    </Badge>
                    {output.is_selected && (
                      <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </button>
                ))}
                
                {/* Show running indicators */}
                {Array.from({ length: viewStatus.runningCount }).map((_, i) => (
                  <div 
                    key={`running-${i}`}
                    className="w-16 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ))}
              </div>

              {/* Select Best Button */}
              <div className="flex justify-center">
                <Button 
                  size="lg"
                  onClick={handleSelectBest}
                  disabled={!currentOutput}
                  variant={currentOutput?.is_selected ? "default" : "outline"}
                  className="gap-2 min-w-48"
                >
                  <Check className="h-5 w-5" />
                  {currentOutput?.is_selected ? 'Selected' : 'Select Best'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Full-screen Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent 
          className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {currentOutput && (
            <div className="relative bg-black">
              <img 
                src={currentOutput.stored_url!}
                alt={`Output ${currentIndex + 1}`}
                className="w-full h-auto max-h-[90vh] object-contain"
              />
              
              {/* Navigation */}
              {completedOutputs.length > 1 && (
                <>
                  <button
                    onClick={handlePrevious}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <button
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                </>
              )}

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-white text-lg font-medium">
                    {currentIndex + 1} / {completedOutputs.length}
                  </span>
                  <Button
                    variant={currentOutput.is_selected ? "default" : "secondary"}
                    size="lg"
                    onClick={handleSelectBest}
                    className="gap-2"
                  >
                    <Check className="h-5 w-5" />
                    {currentOutput.is_selected ? 'Selected' : 'Select Best'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}