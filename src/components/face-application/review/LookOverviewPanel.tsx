import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Clock, ChevronDown } from "lucide-react";
import { LookWithViews, VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWorkflowStateContext } from "@/contexts/WorkflowStateContext";
import { lookNeedsActionForTab } from "@/lib/workflowFilterUtils";

interface LookOverviewPanelProps {
  looks: LookWithViews[];
  selectedLookId: string | null;
  selectedView: string | null;
  onSelectView: (lookId: string, view: string) => void;
}

function ViewStatusDot({ 
  status, 
  hasSelection 
}: { 
  status: 'not_started' | 'running' | 'completed' | 'failed' | 'needs_selection';
  hasSelection: boolean;
}) {
  if (status === 'not_started') {
    return <span className="w-3 h-3 rounded-full bg-muted" />;
  }
  if (status === 'running') {
    return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
  }
  if (status === 'failed') {
    return <AlertCircle className="w-3 h-3 text-red-500" />;
  }
  if (hasSelection) {
    return <Check className="w-3 h-3 text-green-500" />;
  }
  return <Clock className="w-3 h-3 text-yellow-500" />;
}

function LookCard({ 
  look, 
  selectedLookId, 
  selectedView, 
  onSelectView 
}: { 
  look: LookWithViews; 
  selectedLookId: string | null; 
  selectedView: string | null; 
  onSelectView: (lookId: string, view: string) => void;
}) {
  return (
    <div className={cn(
      "px-3 py-2 rounded-lg text-sm font-medium",
      selectedLookId === look.id ? "bg-accent" : ""
    )}>
      <div className="truncate">{look.name}</div>
      
      {/* View grid - 4 clickable dots */}
      <div className="flex gap-2 mt-2">
        {VIEW_TYPES.map(view => {
          const viewStatus = look.views[view];
          const isSelected = selectedLookId === look.id && selectedView === view;
          
          return (
            <button
              key={view}
              onClick={() => onSelectView(look.id, view)}
              className={cn(
                "flex flex-col items-center gap-1 p-1.5 rounded transition-colors min-w-[50px]",
                isSelected 
                  ? "bg-primary/10 ring-1 ring-primary" 
                  : "hover:bg-muted"
              )}
              title={`${VIEW_LABELS[view]}: ${viewStatus?.status || 'not_started'}`}
            >
              <ViewStatusDot 
                status={viewStatus?.status || 'not_started'} 
                hasSelection={viewStatus?.hasSelection || false}
              />
              <span className="text-[10px] text-muted-foreground truncate">
                {view.split('_')[0]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LookOverviewPanel({
  looks,
  selectedLookId,
  selectedView,
  onSelectView,
}: LookOverviewPanelProps) {
  const workflowState = useWorkflowStateContext();

  // Split looks into needs action vs completed
  const { needsActionLooks, completedLooks } = useMemo(() => {
    const needsAction: LookWithViews[] = [];
    const completed: LookWithViews[] = [];

    for (const look of looks) {
      if (lookNeedsActionForTab(workflowState.lookStates, look.id, 'review')) {
        needsAction.push(look);
      } else {
        completed.push(look);
      }
    }

    return { needsActionLooks: needsAction, completedLooks: completed };
  }, [looks, workflowState.lookStates]);

  const showCompleted = workflowState.filterMode === 'all';

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm">Products</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {needsActionLooks.length} need action · {completedLooks.length} complete
        </p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {/* Needs Action Section */}
          {needsActionLooks.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-2 text-xs font-medium text-amber-600">
                <AlertCircle className="h-3 w-3" />
                Needs Action ({needsActionLooks.length})
              </div>
              {needsActionLooks.map(look => (
                <LookCard
                  key={look.id}
                  look={look}
                  selectedLookId={selectedLookId}
                  selectedView={selectedView}
                  onSelectView={onSelectView}
                />
              ))}
            </div>
          )}

          {/* Completed Section */}
          {showCompleted && completedLooks.length > 0 && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger className="flex items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground w-full py-1">
                <ChevronDown className="h-3 w-3 transition-transform duration-200" />
                <Check className="h-3 w-3 text-emerald-500" />
                Completed ({completedLooks.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1 opacity-60">
                {completedLooks.map(look => (
                  <LookCard
                    key={look.id}
                    look={look}
                    selectedLookId={selectedLookId}
                    selectedView={selectedView}
                    onSelectView={onSelectView}
                  />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Empty state */}
          {needsActionLooks.length === 0 && workflowState.filterMode === 'needs_action' && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <Check className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
              All products reviewed!
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}