import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyLook, AIApplyOutput } from "@/types/ai-apply";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  looks: AIApplyLook[];
  onRefetch: () => void;
}

interface OutputThumbnailProps {
  output: AIApplyOutput;
  onSelect: (outputId: string, lookId: string, view: string) => void;
  isSelecting: boolean;
}

function OutputThumbnail({ output, onSelect, isSelecting }: OutputThumbnailProps) {
  const isCompleted = output.status === 'completed' && output.stored_url;
  const isFailed = output.status === 'failed';
  const isRunning = output.status === 'pending' || output.status === 'generating';

  return (
    <div
      className={cn(
        "relative rounded-md overflow-hidden border-2 transition-all cursor-pointer group",
        output.is_selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/50",
        isFailed && "border-destructive/50 bg-destructive/5"
      )}
      onClick={() => isCompleted && onSelect(output.id, output.look_id!, output.view)}
    >
      {isCompleted && output.stored_url ? (
        <img
          src={output.stored_url}
          alt={`Attempt ${output.attempt_index + 1}`}
          className="w-full aspect-[3/4] object-cover"
        />
      ) : isRunning ? (
        <div className="w-full aspect-[3/4] bg-muted flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : isFailed ? (
        <div className="w-full aspect-[3/4] bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-destructive" />
        </div>
      ) : (
        <div className="w-full aspect-[3/4] bg-muted" />
      )}

      {/* Selection indicator */}
      {output.is_selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

      {/* Hover overlay for selectable items */}
      {isCompleted && !output.is_selected && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="text-white text-xs font-medium">
            {isSelecting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Select"}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewDialog({
  open,
  onClose,
  looks,
  onRefetch,
}: ReviewDialogProps) {
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Calculate progress stats
  const stats = looks.reduce(
    (acc, look) => {
      Object.values(look.views).forEach((viewStatus) => {
        if (viewStatus.outputs.length > 0) {
          acc.totalViews++;
          if (viewStatus.hasSelection) {
            acc.selectedViews++;
          }
        }
      });
      return acc;
    },
    { totalViews: 0, selectedViews: 0 }
  );

  // Filter looks that have outputs
  const looksWithOutputs = looks.filter((look) =>
    Object.values(look.views).some((v) => v.outputs.length > 0)
  );

  const handleSelectOutput = useCallback(
    async (outputId: string, lookId: string, view: string) => {
      setSelectingId(outputId);
      try {
        // First, deselect all other outputs for this look/view
        const { error: deselectError } = await supabase
          .from("ai_apply_outputs")
          .update({ is_selected: false })
          .eq("look_id", lookId)
          .eq("view", view);

        if (deselectError) throw deselectError;

        // Then select the clicked one
        const { error: selectError } = await supabase
          .from("ai_apply_outputs")
          .update({ is_selected: true })
          .eq("id", outputId);

        if (selectError) throw selectError;

        toast({
          title: "Selection saved",
          description: "Output selected for this view",
        });

        // Trigger refetch
        onRefetch();
      } catch (error) {
        console.error("Error selecting output:", error);
        toast({
          title: "Error",
          description: "Failed to save selection",
          variant: "destructive",
        });
      } finally {
        setSelectingId(null);
      }
    },
    [toast, onRefetch]
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DialogTitle className="text-xl">Review All Looks</DialogTitle>
              <Badge variant="secondary" className="text-sm">
                {stats.selectedViews} / {stats.totalViews} views selected
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {looksWithOutputs.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">
                No looks with generated outputs yet. Run a batch first.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {looksWithOutputs.map((look) => {
                // Get views that have outputs
                const viewsWithOutputs = Object.entries(look.views).filter(
                  ([_, viewStatus]) => viewStatus.outputs.length > 0
                );

                if (viewsWithOutputs.length === 0) return null;

                return (
                  <div key={look.id} className="space-y-4">
                    {/* Look header */}
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">{look.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {viewsWithOutputs.filter(([_, v]) => v.hasSelection).length} /{" "}
                        {viewsWithOutputs.length} selected
                      </Badge>
                    </div>

                    {/* Views */}
                    <div className="space-y-6 pl-4 border-l-2 border-border">
                      {viewsWithOutputs.map(([viewKey, viewStatus]) => {
                        const viewLabel = VIEW_LABELS[viewKey] || viewKey;
                        const sortedOutputs = [...viewStatus.outputs].sort(
                          (a, b) => a.attempt_index - b.attempt_index
                        );

                        return (
                          <div key={viewKey} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">
                                {viewLabel}
                              </span>
                              {viewStatus.hasSelection && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                              {sortedOutputs.map((output) => (
                                <OutputThumbnail
                                  key={output.id}
                                  output={output}
                                  onSelect={handleSelectOutput}
                                  isSelecting={selectingId === output.id}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
