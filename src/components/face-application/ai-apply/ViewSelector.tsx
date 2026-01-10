import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Check, 
  Loader2, 
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
} from "lucide-react";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyLook, AIApplyViewStatus } from "@/types/ai-apply";
import { useState, useMemo } from "react";

interface ViewSelectorProps {
  looks: AIApplyLook[];
  selectedViews: Set<string>;
  hoveredView: { lookId: string; view: string } | null;
  onToggleView: (lookId: string, view: string) => void;
  onToggleLook: (lookId: string) => void;
  onSelectAll: () => void;
  onSelectByType: (viewType: string) => void;
  onHoverView: (view: { lookId: string; view: string } | null) => void;
}

function StatusIcon({ status }: { status: AIApplyViewStatus['status'] }) {
  if (status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
  }
  if (status === 'completed' || status === 'needs_selection') {
    return <CircleDot className="h-3.5 w-3.5 text-primary" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

export function ViewSelector({
  looks,
  selectedViews,
  hoveredView,
  onToggleView,
  onToggleLook,
  onSelectAll,
  onSelectByType,
  onHoverView,
}: ViewSelectorProps) {
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(
    new Set(looks.map(l => l.id))
  );

  // Get all unique view types across all looks
  const allViewTypes = useMemo(() => {
    const types = new Set<string>();
    looks.forEach(look => {
      Object.keys(look.views).forEach(v => types.add(v));
    });
    return Array.from(types);
  }, [looks]);

  // Calculate total views and selected counts
  const totalViews = looks.reduce((sum, look) => sum + Object.keys(look.views).length, 0);
  const selectedCount = selectedViews.size;
  const allSelected = selectedCount === totalViews && totalViews > 0;

  const toggleLookExpanded = (lookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Check if all views of a look are selected
  const isLookFullySelected = (look: AIApplyLook) => {
    const viewKeys = Object.keys(look.views);
    return viewKeys.every(v => selectedViews.has(`${look.id}:${v}`));
  };

  // Check if some (but not all) views of a look are selected
  const isLookPartiallySelected = (look: AIApplyLook) => {
    const viewKeys = Object.keys(look.views);
    const selectedCount = viewKeys.filter(v => selectedViews.has(`${look.id}:${v}`)).length;
    return selectedCount > 0 && selectedCount < viewKeys.length;
  };

  return (
    <div className="h-full flex flex-col border-r border-border bg-muted/30">
      {/* Header with bulk controls */}
      <div className="p-4 border-b border-border space-y-3">
        <div>
          <h3 className="text-sm font-semibold">View Selector</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedCount} of {totalViews} selected
          </p>
        </div>

        {/* Bulk selection controls */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all"
              checked={allSelected}
              onCheckedChange={() => onSelectAll()}
            />
            <label htmlFor="select-all" className="text-xs cursor-pointer">
              Select All
            </label>
          </div>

          {/* By type buttons */}
          <div className="flex flex-wrap gap-1">
            {allViewTypes.map(viewType => (
              <button
                key={viewType}
                onClick={() => onSelectByType(viewType)}
                className="text-[10px] px-2 py-1 rounded-full bg-muted hover:bg-muted-foreground/10 transition-colors"
              >
                All {VIEW_LABELS[viewType] || viewType}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {looks.map(look => {
            const isExpanded = expandedLooks.has(look.id);
            const isFullySelected = isLookFullySelected(look);
            const isPartiallySelected = isLookPartiallySelected(look);

            return (
              <div key={look.id} className="rounded-lg overflow-hidden">
                {/* Look header with checkbox */}
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md",
                  "hover:bg-accent/50 transition-colors"
                )}>
                  <Checkbox
                    checked={isFullySelected}
                    className={isPartiallySelected ? "data-[state=checked]:bg-primary/50" : ""}
                    onCheckedChange={() => onToggleLook(look.id)}
                  />
                  <button
                    onClick={(e) => toggleLookExpanded(look.id, e)}
                    className="flex items-center gap-2 flex-1 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate text-sm font-medium">{look.name}</span>
                  </button>
                  <Badge 
                    variant="secondary" 
                    className="text-[10px] px-1.5 py-0"
                  >
                    {Object.keys(look.views).length}
                  </Badge>
                </div>

                {/* View list */}
                {isExpanded && (
                  <div className="ml-5 pl-3 border-l border-border/50 space-y-0.5 pb-2">
                    {Object.entries(look.views).map(([viewType, viewStatus]) => {
                      const viewId = `${look.id}:${viewType}`;
                      const isSelected = selectedViews.has(viewId);
                      const isHovered = hoveredView?.lookId === look.id && hoveredView?.view === viewType;

                      return (
                        <div
                          key={viewType}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer",
                            "hover:bg-accent/50 transition-colors",
                            isHovered && "bg-accent/30"
                          )}
                          onMouseEnter={() => onHoverView({ lookId: look.id, view: viewType })}
                          onMouseLeave={() => onHoverView(null)}
                          onClick={() => onToggleView(look.id, viewType)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleView(look.id, viewType)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-xs truncate flex-1">
                            {VIEW_LABELS[viewType] || viewType}
                          </span>
                          <StatusIcon status={viewStatus?.status || 'not_started'} />
                          
                          {/* Tiny thumbnails */}
                          {viewStatus?.pairing?.headRender?.url && (
                            <img 
                              src={viewStatus.pairing.headRender.url} 
                              alt=""
                              className="w-5 h-5 rounded object-cover border border-border"
                            />
                          )}
                          {viewStatus?.pairing?.bodyImage?.url && (
                            <img 
                              src={viewStatus.pairing.bodyImage.url} 
                              alt=""
                              className="w-5 h-5 rounded object-cover border border-border"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
