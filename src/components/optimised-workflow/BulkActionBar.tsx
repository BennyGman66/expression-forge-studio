import { X, User, Crop, ScanFace, Sparkles, CheckSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  WorkflowLookWithDetails, 
  WorkflowStage, 
  STAGE_CONFIG,
  STAGE_ACTIONS 
} from '@/types/optimised-workflow';
import { useBulkUpdateLookStage } from '@/hooks/useWorkflowLooks';

interface BulkActionBarProps {
  selectedLooks: WorkflowLookWithDetails[];
  selectedStages: Set<WorkflowStage>;
  onClearSelection: () => void;
  projectId: string;
}

const ICON_MAP = {
  User,
  Crop,
  ScanFace,
  Sparkles,
  CheckSquare,
  Send,
};

export function BulkActionBar({
  selectedLooks,
  selectedStages,
  onClearSelection,
  projectId,
}: BulkActionBarProps) {
  const bulkUpdateStage = useBulkUpdateLookStage();

  const isSingleStage = selectedStages.size === 1;
  const currentStage = isSingleStage ? [...selectedStages][0] : null;

  // Get available actions for current stage
  const availableActions = currentStage
    ? STAGE_ACTIONS.filter(a => a.stage === currentStage)
    : [];

  const handleAction = async (action: typeof STAGE_ACTIONS[number]) => {
    // For now, just log - actual modals will be implemented in Phase 2
    console.log('Action:', action.action, 'for looks:', selectedLooks.map(l => l.id));
    
    // TODO: Open the appropriate modal/dialog for this stage action
    // For demonstration, we'll just show the action was triggered
  };

  return (
    <div className="sticky top-[120px] z-10 flex items-center justify-between px-6 py-3 bg-primary/10 border-b">
      <div className="flex items-center gap-4">
        <Badge variant="secondary" className="text-sm font-medium">
          {selectedLooks.length} selected
        </Badge>

        {isSingleStage && currentStage && (
          <span className="text-sm text-muted-foreground">
            Stage: <span className="font-medium">{STAGE_CONFIG[currentStage].shortLabel}</span>
          </span>
        )}

        {!isSingleStage && (
          <span className="text-sm text-amber-600">
            Multiple stages selected - select looks in the same stage for bulk actions
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isSingleStage && availableActions.length > 0 && (
          <>
            {availableActions.map(action => {
              const Icon = ICON_MAP[action.icon as keyof typeof ICON_MAP] || Sparkles;
              return (
                <Button
                  key={action.action}
                  size="sm"
                  onClick={() => handleAction(action)}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {action.label}
                </Button>
              );
            })}
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
