import { cn } from "@/lib/utils";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyLook, AIApplyViewStatus, AIApplyOutput } from "@/types/ai-apply";
import { Circle, CheckCircle2, XCircle, Loader2, Check } from "lucide-react";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ContextPreviewProps {
  hoveredView: { lookId: string; view: string } | null;
  looks: AIApplyLook[];
  onRefetch?: () => void;
}

function StatusText({ status }: { status: AIApplyViewStatus['status'] }) {
  switch (status) {
    case 'running':
      return <span className="text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Generating...</span>;
    case 'completed':
      return <span className="text-primary">Complete</span>;
    case 'needs_selection':
      return <span className="text-amber-500">Needs Selection</span>;
    case 'failed':
      return <span className="text-destructive">Failed</span>;
    default:
      return <span className="text-muted-foreground">Not started</span>;
  }
}

interface OutputCardProps {
  output: AIApplyOutput;
  onSelect: (outputId: string) => void;
  isSelecting: boolean;
}

function OutputCard({ output, onSelect, isSelecting }: OutputCardProps) {
  const isCompleted = output.status === 'completed' && output.stored_url;
  const isFailed = output.status === 'failed';
  const isRunning = output.status === 'pending' || output.status === 'generating';

  return (
    <div 
      className={cn(
        "relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer group",
        output.is_selected 
          ? "border-primary ring-2 ring-primary/30" 
          : "border-border hover:border-primary/50",
        isFailed && "border-destructive/50 bg-destructive/5"
      )}
      onClick={() => isCompleted && onSelect(output.id)}
    >
      {isCompleted && output.stored_url ? (
        <img 
          src={output.stored_url}
          alt={`Attempt ${output.attempt_index + 1}`}
          className="w-full aspect-[3/4] object-cover"
        />
      ) : isRunning ? (
        <div className="w-full aspect-[3/4] bg-muted flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isFailed ? (
        <div className="w-full aspect-[3/4] bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-6 w-6 text-destructive" />
        </div>
      ) : (
        <div className="w-full aspect-[3/4] bg-muted" />
      )}

      {/* Selection indicator */}
      {output.is_selected && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-4 w-4 text-primary-foreground" />
        </div>
      )}

      {/* Hover overlay for selectable items */}
      {isCompleted && !output.is_selected && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="text-white text-sm font-medium">
            {isSelecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Click to select"}
          </div>
        </div>
      )}

      {/* Attempt number */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="text-white text-xs">Attempt {output.attempt_index + 1}</span>
      </div>
    </div>
  );
}

export function ContextPreview({
  hoveredView,
  looks,
  onRefetch,
}: ContextPreviewProps) {
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Find the view status for hovered view
  const hoveredLook = hoveredView ? looks.find(l => l.id === hoveredView.lookId) : null;
  const hoveredViewStatus = hoveredLook && hoveredView 
    ? hoveredLook.views[hoveredView.view] 
    : null;

  const handleSelectOutput = useCallback(async (outputId: string) => {
    if (!hoveredView) return;
    
    setSelectingId(outputId);
    try {
      // First, deselect all other outputs for this look/view
      const { error: deselectError } = await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: false })
        .eq('look_id', hoveredView.lookId)
        .eq('view', hoveredView.view);

      if (deselectError) throw deselectError;

      // Then select the clicked one
      const { error: selectError } = await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: true })
        .eq('id', outputId);

      if (selectError) throw selectError;

      toast({
        title: "Selection saved",
        description: "Output selected for this view",
      });

      // Trigger refetch
      onRefetch?.();
    } catch (error) {
      console.error('Error selecting output:', error);
      toast({
        title: "Error",
        description: "Failed to save selection",
        variant: "destructive",
      });
    } finally {
      setSelectingId(null);
    }
  }, [hoveredView, toast, onRefetch]);

  if (!hoveredView || !hoveredLook || !hoveredViewStatus) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-muted/10">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-muted/50 flex items-center justify-center">
            <Circle className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            Hover over a view to preview the pairing
          </p>
          <p className="text-xs text-muted-foreground/70">
            Select views from the left panel, then run batch
          </p>
        </div>
      </div>
    );
  }

  const { pairing, outputs } = hoveredViewStatus;
  const headUrl = pairing?.headRender?.url;
  const bodyUrl = pairing?.bodyImage?.url;
  const viewLabel = VIEW_LABELS[hoveredView.view] || hoveredView.view;
  
  // Get completed and other outputs
  const completedOutputs = outputs.filter(o => o.status === 'completed' && o.stored_url);
  const runningOutputs = outputs.filter(o => o.status === 'pending' || o.status === 'generating');
  const failedOutputs = outputs.filter(o => o.status === 'failed');

  const hasOutputs = outputs.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{hoveredLook.name}</h3>
            <p className="text-sm text-muted-foreground">{viewLabel}</p>
          </div>
          <StatusText status={hoveredViewStatus.status} />
        </div>
      </div>

      {/* Content - Show outputs grid if available, otherwise show pairing preview */}
      <div className="flex-1 overflow-y-auto p-6">
        {hasOutputs ? (
          <div className="space-y-4">
            {/* Outputs grid */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Generated Results ({completedOutputs.length} completed{runningOutputs.length > 0 ? `, ${runningOutputs.length} running` : ''}{failedOutputs.length > 0 ? `, ${failedOutputs.length} failed` : ''})
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {outputs
                  .sort((a, b) => a.attempt_index - b.attempt_index)
                  .map(output => (
                    <OutputCard
                      key={output.id}
                      output={output}
                      onSelect={handleSelectOutput}
                      isSelecting={selectingId === output.id}
                    />
                  ))
                }
              </div>
            </div>

            {/* Source images reference */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">Source Images</p>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Head</p>
                  {headUrl ? (
                    <img src={headUrl} alt="Head" className="w-16 h-20 rounded object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-20 rounded bg-muted border border-dashed border-border flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">—</span>
                    </div>
                  )}
                </div>
                <div className="text-muted-foreground">+</div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Body</p>
                  {bodyUrl ? (
                    <img src={bodyUrl} alt="Body" className="w-16 h-20 rounded object-cover border border-border" />
                  ) : (
                    <div className="w-16 h-20 rounded bg-muted border border-dashed border-border flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">—</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* No outputs yet - show pairing preview */
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-8">
              {/* Head image */}
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Head</p>
                {headUrl ? (
                  <div className="relative">
                    <img 
                      src={headUrl}
                      alt="Head reference"
                      className="w-32 h-40 rounded-lg object-cover border-2 border-border shadow-md"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-40 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border">
                    <span className="text-xs text-muted-foreground">No head</span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="text-muted-foreground text-2xl">→</div>

              {/* Body image */}
              <div className="text-center space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Body</p>
                {bodyUrl ? (
                  <div className="relative">
                    <img 
                      src={bodyUrl}
                      alt="Body reference"
                      className="w-32 h-40 rounded-lg object-cover border-2 border-border shadow-md"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-40 rounded-lg bg-muted flex items-center justify-center border-2 border-dashed border-border">
                    <span className="text-xs text-muted-foreground">No body</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Warnings if any */}
      {pairing?.warnings && pairing.warnings.length > 0 && (
        <div className="px-6 py-3 border-t border-border bg-amber-50/50">
          <p className="text-xs text-amber-700">
            ⚠️ {pairing.warnings[0]}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="px-6 py-3 border-t border-border bg-card">
        <div className="flex items-center gap-6 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">{hoveredViewStatus.completedCount}</span> completed
          </div>
          <div>
            <span className="font-medium">{hoveredViewStatus.runningCount}</span> running
          </div>
          <div>
            <span className="font-medium">{hoveredViewStatus.failedCount}</span> failed
          </div>
          {hoveredViewStatus.hasSelection && (
            <div className="flex items-center gap-1 text-primary">
              <CheckCircle2 className="h-3 w-3" />
              <span>Has selection</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
