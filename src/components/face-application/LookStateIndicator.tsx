import { Circle, Check, Lock, AlertTriangle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ViewStateStatus } from '@/types/workflow-state';
import { STATUS_CONFIG } from '@/types/workflow-state';

interface LookStateIndicatorProps {
  view: string;
  status: ViewStateStatus;
  completedAt?: string | null;
  completedBy?: string | null;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

const iconMap = {
  circle: Circle,
  check: Check,
  lock: Lock,
  'alert-triangle': AlertTriangle,
  loader: Loader2,
};

export function LookStateIndicator({
  view,
  status,
  completedAt,
  completedBy,
  showLabel = false,
  size = 'sm',
}: LookStateIndicatorProps) {
  const config = STATUS_CONFIG[status];
  const Icon = iconMap[config.icon as keyof typeof iconMap] || Circle;
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  
  const content = (
    <div className={cn(
      "flex items-center gap-1",
      status === 'completed' && "opacity-60",
      status === 'signed_off' && "opacity-50"
    )}>
      <Icon className={cn(
        iconSize,
        config.color,
        status === 'in_progress' && "animate-spin"
      )} />
      {showLabel && (
        <span className={cn("text-xs", config.color)}>
          {config.label}
        </span>
      )}
    </div>
  );
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            <div className="font-medium">{view}: {config.label}</div>
            {completedAt && (
              <div className="text-muted-foreground">
                Completed: {new Date(completedAt).toLocaleString()}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ViewStatesRowProps {
  views: string[];
  getStatus: (view: string) => ViewStateStatus;
  getCompletedAt?: (view: string) => string | null;
}

export function ViewStatesRow({ views, getStatus, getCompletedAt }: ViewStatesRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      {views.map(view => (
        <LookStateIndicator
          key={view}
          view={view}
          status={getStatus(view)}
          completedAt={getCompletedAt?.(view)}
        />
      ))}
    </div>
  );
}
