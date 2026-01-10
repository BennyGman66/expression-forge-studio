import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { 
  Play, 
  Plus, 
  RotateCcw, 
  XCircle, 
  Check, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from "lucide-react";
import { VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplyViewStatus, AIApplyOutput } from "@/types/ai-apply";
import { PairingInspector } from "./PairingInspector";
import { cn } from "@/lib/utils";

interface AIApplyOutputPanelProps {
  viewStatus: AIApplyViewStatus | null;
  view: string | null;
  lookName: string;
  onRun: () => void;
  onAddMore: () => void;
  onRetryFailed: () => void;
  onCancel: () => void;
  onSelectOutput: (outputId: string) => void;
  isRunning: boolean;
}

export function AIApplyOutputPanel({
  viewStatus,
  view,
  lookName,
  onRun,
  onAddMore,
  onRetryFailed,
  onCancel,
  onSelectOutput,
  isRunning,
}: AIApplyOutputPanelProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!viewStatus || !view) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground">Select a look and view from the left panel</p>
      </div>
    );
  }

  const viewLabel = VIEW_LABELS[view as ViewType] || view;
  const completedOutputs = viewStatus.outputs.filter(o => o.status === 'completed' && o.stored_url);
  const hasOutputs = viewStatus.totalAttempts > 0;
  const canRun = viewStatus.pairing?.canRun ?? false;
  const hasRunning = viewStatus.runningCount > 0;
  const hasFailed = viewStatus.failedCount > 0;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const handlePrevious = () => {
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : completedOutputs.length - 1));
  };

  const handleNext = () => {
    setLightboxIndex(prev => (prev < completedOutputs.length - 1 ? prev + 1 : 0));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    else if (e.key === 'ArrowRight') handleNext();
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (completedOutputs[lightboxIndex]) {
        onSelectOutput(completedOutputs[lightboxIndex].id);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">{lookName}</h3>
          <p className="text-xs text-muted-foreground">{viewLabel}</p>
        </div>
        <Badge variant={
          viewStatus.status === 'completed' ? 'default' :
          viewStatus.status === 'running' ? 'secondary' :
          viewStatus.status === 'failed' ? 'destructive' :
          viewStatus.status === 'needs_selection' ? 'outline' : 'secondary'
        }>
          {viewStatus.status === 'completed' ? 'Selected' :
           viewStatus.status === 'running' ? 'Running' :
           viewStatus.status === 'failed' ? 'Failed' :
           viewStatus.status === 'needs_selection' ? 'Needs Selection' : 'Not Started'}
        </Badge>
      </div>

      {/* Pairing section */}
      <div className="p-4 border-b border-border">
        <PairingInspector pairing={viewStatus.pairing} view={view} />
      </div>

      {/* Outputs grid */}
      <div className="flex-1 overflow-auto p-4">
        {!hasOutputs ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <p className="text-muted-foreground text-sm">No AI outputs yet</p>
            <Button 
              onClick={onRun} 
              disabled={!canRun || isRunning}
              className="gap-2"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run 4 Attempts
            </Button>
            {!canRun && viewStatus.pairing?.missingRequirements.length > 0 && (
              <p className="text-xs text-destructive text-center max-w-xs">
                Cannot run: {viewStatus.pairing.missingRequirements[0]}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center gap-2">
              {hasRunning ? (
                <Button variant="destructive" size="sm" onClick={onCancel} className="gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onAddMore}
                    disabled={viewStatus.totalAttempts >= 8 || !canRun}
                    className="gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add 2 More
                  </Button>
                  {hasFailed && (
                    <Button variant="outline" size="sm" onClick={onRetryFailed} className="gap-1">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry Failed
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Output grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {viewStatus.outputs.map((output, index) => (
                <OutputCard
                  key={output.id}
                  output={output}
                  index={index}
                  onSelect={() => onSelectOutput(output.id)}
                  onOpenLightbox={() => {
                    const completedIndex = completedOutputs.findIndex(o => o.id === output.id);
                    if (completedIndex >= 0) openLightbox(completedIndex);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent 
          className="max-w-4xl p-0 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {completedOutputs[lightboxIndex] && (
            <div className="relative">
              <img 
                src={completedOutputs[lightboxIndex].stored_url!}
                alt={`Output ${lightboxIndex + 1}`}
                className="w-full h-auto max-h-[80vh] object-contain bg-black"
              />
              
              {/* Navigation */}
              <button
                onClick={handlePrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight className="h-6 w-6" />
              </button>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm">
                    {lightboxIndex + 1} / {completedOutputs.length}
                  </span>
                  <Button
                    variant={completedOutputs[lightboxIndex].is_selected ? "default" : "secondary"}
                    size="sm"
                    onClick={() => onSelectOutput(completedOutputs[lightboxIndex].id)}
                    className="gap-2"
                  >
                    <Check className="h-4 w-4" />
                    {completedOutputs[lightboxIndex].is_selected ? 'Selected' : 'Select'}
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

interface OutputCardProps {
  output: AIApplyOutput;
  index: number;
  onSelect: () => void;
  onOpenLightbox: () => void;
}

function OutputCard({ output, index, onSelect, onOpenLightbox }: OutputCardProps) {
  const isCompleted = output.status === 'completed' && output.stored_url;
  const isFailed = output.status === 'failed';
  const isRunning = output.status === 'pending' || output.status === 'generating';

  return (
    <div 
      className={cn(
        "relative aspect-[3/4] rounded-lg border overflow-hidden group",
        output.is_selected && "ring-2 ring-primary ring-offset-2",
        isFailed && "border-destructive/50 bg-destructive/5"
      )}
    >
      {isCompleted ? (
        <>
          <img 
            src={output.stored_url!}
            alt={`Attempt ${index + 1}`}
            className="w-full h-full object-cover"
          />
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); onOpenLightbox(); }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={output.is_selected ? "default" : "secondary"}
              className="h-8 w-8"
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>

          {/* Selection indicator */}
          {output.is_selected && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
              <Check className="h-3 w-3" />
            </div>
          )}
        </>
      ) : isRunning ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground mt-2">Generating...</span>
        </div>
      ) : isFailed ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-destructive/5">
          <XCircle className="h-6 w-6 text-destructive" />
          <span className="text-xs text-destructive mt-2">Failed</span>
          {output.error_message && (
            <span className="text-[10px] text-muted-foreground mt-1 px-2 text-center line-clamp-2">
              {output.error_message}
            </span>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30">
          <span className="text-xs text-muted-foreground">Pending</span>
        </div>
      )}

      {/* Attempt number badge */}
      <Badge 
        variant="secondary" 
        className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0"
      >
        #{index + 1}
      </Badge>
    </div>
  );
}
