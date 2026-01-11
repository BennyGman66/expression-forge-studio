import { Circle, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabBadgeProps {
  needsAction: number;
  total: number;
  complete: number;
}

export function TabBadge({ needsAction, total, complete }: TabBadgeProps) {
  if (total === 0) {
    return null;
  }
  
  // All complete
  if (complete === total) {
    return (
      <span className="ml-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20">
        <Check className="h-3 w-3 text-emerald-500" />
      </span>
    );
  }
  
  // Some need action
  if (needsAction > 0) {
    return (
      <span className="ml-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/20 text-amber-600 text-[10px] font-medium">
        {needsAction}
      </span>
    );
  }
  
  // In progress (some complete, none need action means in_progress)
  return (
    <span className="ml-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-muted">
      <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
    </span>
  );
}
