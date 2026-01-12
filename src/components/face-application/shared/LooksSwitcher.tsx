import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { useWorkflowStateContext } from "@/contexts/WorkflowStateContext";
import { lookNeedsActionForTab } from "@/lib/workflowFilterUtils";
import type { TabName } from "@/types/workflow-state";

interface Look {
  id: string;
  name: string;
}

interface LooksSwitcherProps {
  looks: Look[];
  selectedLookId: string | null;
  tab: TabName;
  onLookChange: (lookId: string) => void;
  className?: string;
}

export function LooksSwitcher({ 
  looks, 
  selectedLookId, 
  tab, 
  onLookChange,
  className = "",
}: LooksSwitcherProps) {
  const workflowState = useWorkflowStateContext();

  // Split looks into needs action vs completed
  const { needsActionLooks, completedLooks } = useMemo(() => {
    const needsAction: Look[] = [];
    const completed: Look[] = [];

    for (const look of looks) {
      if (lookNeedsActionForTab(workflowState.lookStates, look.id, tab)) {
        needsAction.push(look);
      } else {
        completed.push(look);
      }
    }

    return { needsActionLooks: needsAction, completedLooks: completed };
  }, [looks, workflowState.lookStates, tab]);

  // When filter mode is 'needs_action', only show needs action looks
  const showCompleted = workflowState.filterMode === 'all';
  const displayLooks = workflowState.filterMode === 'needs_action' 
    ? needsActionLooks 
    : [...needsActionLooks, ...completedLooks];

  if (looks.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Needs Action Section */}
      {needsActionLooks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-600">
            <AlertCircle className="h-3 w-3" />
            Needs Action ({needsActionLooks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {needsActionLooks.map((look) => (
              <Button
                key={look.id}
                size="sm"
                variant={look.id === selectedLookId ? "default" : "outline"}
                className="shrink-0 text-xs"
                onClick={() => onLookChange(look.id)}
              >
                {look.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Completed Section - Collapsible */}
      {showCompleted && completedLooks.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full">
            <ChevronDown className="h-3 w-3 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
            <Check className="h-3 w-3 text-emerald-500" />
            Completed ({completedLooks.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="flex flex-wrap gap-2 opacity-60">
              {completedLooks.map((look) => (
                <Button
                  key={look.id}
                  size="sm"
                  variant={look.id === selectedLookId ? "secondary" : "ghost"}
                  className="shrink-0 text-xs"
                  onClick={() => onLookChange(look.id)}
                >
                  {look.name}
                </Button>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Empty state when all done */}
      {needsActionLooks.length === 0 && workflowState.filterMode === 'needs_action' && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <Check className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
          All looks completed for this step!
        </div>
      )}
    </div>
  );
}
