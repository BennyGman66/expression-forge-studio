import { cn } from "@/lib/utils";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyLook, AIApplyViewStatus } from "@/types/ai-apply";
import { Circle, CircleDot, Loader2, CheckCircle2 } from "lucide-react";

interface ContextPreviewProps {
  hoveredView: { lookId: string; view: string } | null;
  looks: AIApplyLook[];
}

function StatusText({ status }: { status: AIApplyViewStatus['status'] }) {
  switch (status) {
    case 'running':
      return <span className="text-blue-500">Generating...</span>;
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

export function ContextPreview({
  hoveredView,
  looks,
}: ContextPreviewProps) {
  // Find the view status for hovered view
  const hoveredLook = hoveredView ? looks.find(l => l.id === hoveredView.lookId) : null;
  const hoveredViewStatus = hoveredLook && hoveredView 
    ? hoveredLook.views[hoveredView.view] 
    : null;

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

  const { pairing } = hoveredViewStatus;
  const headUrl = pairing?.headRender?.url;
  const bodyUrl = pairing?.bodyImage?.url;
  const viewLabel = VIEW_LABELS[hoveredView.view] || hoveredView.view;

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

      {/* Preview content */}
      <div className="flex-1 flex items-center justify-center p-8">
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
