import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Check, 
  Loader2, 
  ChevronDown,
  ChevronRight 
} from "lucide-react";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyLook, AIApplyViewStatus } from "@/types/ai-apply";
import { useState } from "react";

interface AIApplyLooksListProps {
  looks: AIApplyLook[];
  selectedLookId: string | null;
  selectedView: string | null;
  onSelectView: (lookId: string, view: string) => void;
}

function ViewStatusBadge({ status, attemptCount }: { status: AIApplyViewStatus['status']; attemptCount: number }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
      </div>
    );
  }
  
  if (status === 'completed') {
    return <Check className="h-3.5 w-3.5 text-green-500" />;
  }
  
  if (status === 'needs_selection' && attemptCount > 0) {
    return (
      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
        {attemptCount}
      </Badge>
    );
  }
  
  if (attemptCount > 0) {
    return (
      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
        {attemptCount}
      </Badge>
    );
  }
  
  return <span className="text-[10px] text-muted-foreground">—</span>;
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
    const allViews = Object.keys(look.views);
    const selectedCount = allViews.filter(v => look.views[v]?.hasSelection).length;
    return `${selectedCount}/${allViews.length}`;
  };

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold">Looks</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {looks.length} ready for AI Apply
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
                  "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md",
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
              </button>

              {/* View list - only show views with selected heads */}
              {expandedLooks.has(look.id) && (
                <div className="ml-5 pl-3 border-l border-border/50 space-y-0.5 pb-2">
                  {Object.entries(look.views).map(([viewType, viewStatus]) => {
                    const isSelected = selectedLookId === look.id && selectedView === viewType;

                    return (
                      <button
                        key={viewType}
                        onClick={() => onSelectView(look.id, viewType)}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded-md",
                          "hover:bg-accent/50 transition-colors",
                          isSelected && "bg-primary/10 text-primary font-medium"
                        )}
                      >
                        <span className="truncate text-left">
                          {VIEW_LABELS[viewType] || viewType}
                        </span>
                        <ViewStatusBadge 
                          status={viewStatus?.status || 'not_started'} 
                          attemptCount={viewStatus?.completedCount || 0}
                        />
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