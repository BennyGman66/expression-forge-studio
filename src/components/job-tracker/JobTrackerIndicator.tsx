import { Activity, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { JobTrackerDropdown } from './JobTrackerDropdown';
import { useActiveJobs } from '@/hooks/useActiveJobs';

import { useState } from 'react';

export function JobTrackerIndicator() {
  const { activeJobs, recentJobs, activeCount, totalProgress, isLoading, markJobStalled } = useActiveJobs();
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveJobs = activeCount > 0;
  const stalledCount = activeJobs.filter(j => j.isStalled).length;
  const hasStalled = stalledCount > 0;
  
  const progressPercent = totalProgress.total > 0
    ? Math.round((totalProgress.done / totalProgress.total) * 100)
    : 0;

  // Get the most recent active job for display
  const primaryJob = activeJobs[0];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={hasStalled ? 'destructive' : hasActiveJobs ? 'default' : 'ghost'}
          size="sm"
          className={hasActiveJobs ? 'gap-2 px-3' : 'gap-1.5'}
        >
          {hasStalled ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {stalledCount} Stalled
              </span>
            </>
          ) : hasActiveJobs ? (
            <>
              <div className="relative w-5 h-4 flex items-center justify-center">
                <Activity className="h-3.5 w-3.5 relative z-10" />
                <div className="absolute inset-0 flex items-center">
                  <div className="job-tracker-pulse" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">
                  {totalProgress.done}/{totalProgress.total}
                </span>
                <div className="w-16 h-1.5 bg-primary-foreground/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-foreground transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <Activity className="h-4 w-4" />
              <span className="text-xs">Jobs</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="p-0 w-80 bg-popover"
        sideOffset={8}
      >
        <JobTrackerDropdown 
          activeJobs={activeJobs} 
          recentJobs={recentJobs} 
          onMarkStalled={markJobStalled}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
