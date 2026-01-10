import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Check, 
  Circle, 
  Loader2, 
  AlertCircle, 
  AlertTriangle,
  ChevronDown,
  ChevronRight 
} from "lucide-react";
import { VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplyLook, AIApplyViewStatus } from "@/types/ai-apply";
import { useState } from "react";

interface AIApplyLooksListProps {
  looks: AIApplyLook[];
  selectedLookId: string | null;
  selectedView: string | null;
  onSelectView: (lookId: string, view: string) => void;
}

function ViewStatusIcon({ status }: { status: AIApplyViewStatus['status'] }) {
  switch (status) {
    case 'completed':
      return <Check className="h-3.5 w-3.5 text-green-500" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
    case 'failed':
      return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
    case 'needs_selection':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    default:
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
  }
}

export function AIApplyLooksList({
  looks,
  selectedLookId,
  selectedView,
  onSelectView,
}: AIApplyLooksListProps) {
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set(looks.map(l => l.id)));

  const toggleLook = (lookId: string) => {
    setExpandedLooks(prev => {
      const next = new Set(prev);
      if (next.has(lookId)) {
        next.delete(lookId);
      } else {
        next.add(lookId);
      }
      return next;
    });
  };

  const getLookProgress = (look: AIApplyLook) => {
    const selectedCount = VIEW_TYPES.filter(v => look.views[v]?.hasSelection).length;
    return `${selectedCount}/${VIEW_TYPES.length}`;
  };

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-medium">Looks</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {looks.length} looks ready for AI Apply
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {looks.map(look => (
            <div key={look.id} className="rounded-lg overflow-hidden">
              {/* Look header */}
              <button
                onClick={() => toggleLook(look.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md",
                  "hover:bg-accent/50 transition-colors",
                  selectedLookId === look.id && "bg-accent"
                )}
              >
                {expandedLooks.has(look.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="truncate flex-1 text-left font-medium">{look.name}</span>
                <Badge 
                  variant={look.isReady ? "default" : "secondary"} 
                  className="text-[10px] px-1.5 py-0"
                >
                  {getLookProgress(look)}
                </Badge>
                {look.hasWarnings && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                )}
              </button>

              {/* View list */}
              {expandedLooks.has(look.id) && (
                <div className="ml-4 pl-2 border-l border-border/50 space-y-0.5 pb-1">
                  {VIEW_TYPES.map(viewType => {
                    const viewStatus = look.views[viewType];
                    const isSelected = selectedLookId === look.id && selectedView === viewType;
                    const canRun = viewStatus?.pairing?.canRun ?? false;

                    return (
                      <button
                        key={viewType}
                        onClick={() => onSelectView(look.id, viewType)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1 text-xs rounded-md",
                          "hover:bg-accent/50 transition-colors",
                          isSelected && "bg-primary/10 text-primary",
                          !canRun && "opacity-50"
                        )}
                      >
                        <ViewStatusIcon status={viewStatus?.status || 'not_started'} />
                        <span className="truncate flex-1 text-left">
                          {VIEW_LABELS[viewType as ViewType] || viewType}
                        </span>
                        {viewStatus?.totalAttempts > 0 && (
                          <span className="text-muted-foreground">
                            {viewStatus.completedCount}/{viewStatus.totalAttempts}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
