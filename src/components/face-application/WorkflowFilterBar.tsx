import { Filter, Eye, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { FilterMode, TabName } from '@/types/workflow-state';

interface WorkflowFilterBarProps {
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  needsActionCount: number;
  totalCount: number;
  completeCount: number;
  currentTab: TabName;
}

export function WorkflowFilterBar({
  filterMode,
  onFilterChange,
  needsActionCount,
  totalCount,
  completeCount,
  currentTab,
}: WorkflowFilterBarProps) {
  const progressPercent = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;
  
  return (
    <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={filterMode === 'needs_action' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFilterChange('needs_action')}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Needs Action
            {needsActionCount > 0 && (
              <Badge variant="secondary" className="ml-1 bg-amber-500/20 text-amber-600">
                {needsActionCount}
              </Badge>
            )}
          </Button>
          
          <Button
            variant={filterMode === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFilterChange('all')}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Show All
          </Button>
        </div>
        
        {/* Progress Summary */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className={cn(
              "h-4 w-4",
              completeCount === totalCount ? "text-emerald-500" : "text-muted-foreground"
            )} />
            <span className="text-muted-foreground">
              {completeCount} of {totalCount} views complete
            </span>
          </div>
          
          <div className="w-32">
            <Progress value={progressPercent} className="h-2" />
          </div>
          
          <span className="text-sm font-medium tabular-nums">
            {progressPercent}%
          </span>
        </div>
      </div>
    </div>
  );
}
