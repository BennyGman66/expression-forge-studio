import { Check, X, Minus } from 'lucide-react';
import { WorkflowImage, WorkflowStage, WORKFLOW_VIEWS } from '@/types/optimised-workflow';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ViewsStatusIconsProps {
  images: WorkflowImage[];
  stage: WorkflowStage;
}

// Check what's "complete" for each view based on current stage
function getViewStatus(
  view: string,
  images: WorkflowImage[],
  stage: WorkflowStage
): 'complete' | 'pending' | 'missing' {
  const image = images.find(img => img.view === view);
  
  if (!image) return 'missing';

  switch (stage) {
    case 'LOOKS_UPLOADED':
      return 'complete'; // Just having the image is complete for this stage
    case 'MODEL_PAIRED':
      return 'complete';
    case 'HEADS_CROPPED':
      return image.head_cropped_url ? 'complete' : 'pending';
    case 'FACE_MATCHED':
      return image.matched_face_url ? 'complete' : 'pending';
    case 'GENERATED':
    case 'REVIEW_SELECTED':
    case 'JOB_BOARD':
    case 'DONE':
      return 'complete';
    default:
      return 'complete';
  }
}

const VIEW_LABELS: Record<string, string> = {
  full_front: 'Full Front',
  cropped_front: 'Cropped Front',
  back: 'Back',
  detail: 'Detail',
  side: 'Side',
};

export function ViewsStatusIcons({ images, stage }: ViewsStatusIconsProps) {
  // Only show primary views
  const viewsToShow = ['full_front', 'back', 'detail', 'side'];
  
  return (
    <div className="flex items-center gap-1">
      {viewsToShow.map(view => {
        const status = getViewStatus(view, images, stage);
        
        return (
          <Tooltip key={view}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'w-5 h-5 rounded flex items-center justify-center text-xs',
                  status === 'complete' && 'bg-emerald-100 text-emerald-600',
                  status === 'pending' && 'bg-amber-100 text-amber-600',
                  status === 'missing' && 'bg-muted text-muted-foreground'
                )}
              >
                {status === 'complete' && <Check className="h-3 w-3" />}
                {status === 'pending' && <Minus className="h-3 w-3" />}
                {status === 'missing' && <X className="h-3 w-3" />}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {VIEW_LABELS[view] || view}: {status}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
