import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { JobRow } from './JobRow';
import { JobDetailModal } from './JobDetailModal';
import { useState } from 'react';
import type { PipelineJob } from '@/types/pipeline-jobs';
import type { EnhancedPipelineJob } from '@/hooks/useActiveJobs';

interface JobTrackerDropdownProps {
  activeJobs: EnhancedPipelineJob[];
  recentJobs: EnhancedPipelineJob[];
  onMarkStalled?: (jobId: string) => void;
  onClose?: () => void;
}

export function JobTrackerDropdown({ activeJobs, recentJobs, onMarkStalled, onClose }: JobTrackerDropdownProps) {
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);

  // Split active jobs into running and paused
  const runningJobs = activeJobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED');
  const pausedJobs = activeJobs.filter(j => j.status === 'PAUSED');

  const hasRunningJobs = runningJobs.length > 0;
  const hasPausedJobs = pausedJobs.length > 0;
  const hasRecentJobs = recentJobs.length > 0;
  const isEmpty = !hasRunningJobs && !hasPausedJobs && !hasRecentJobs;

  // Count stalled and abandoned jobs
  const stalledCount = runningJobs.filter(j => j.isStalled).length;
  const abandonedCount = pausedJobs.filter(j => j.isAbandoned).length;

  return (
    <>
      <div className="w-80 max-h-[480px] flex flex-col bg-popover">
        <ScrollArea className="flex-1">
          {isEmpty && (
            <div className="p-6 text-center text-muted-foreground">
              <p className="text-sm">No active or recent jobs</p>
              <p className="text-xs mt-1">Jobs will appear here when you start generation tasks</p>
            </div>
          )}
          
          {hasRunningJobs && (
            <div>
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0">
                RUNNING ({runningJobs.length})
                {stalledCount > 0 && (
                  <span className="text-destructive ml-2">· {stalledCount} stalled</span>
                )}
              </div>
              {runningJobs.map((job) => (
                <JobRow 
                  key={job.id} 
                  job={job} 
                  onOpenDetail={setSelectedJob}
                  onMarkStalled={onMarkStalled}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
          
          {hasRunningJobs && hasPausedJobs && <Separator />}
          
          {hasPausedJobs && (
            <div>
              <div className="px-3 py-2 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400 sticky top-0">
                PAUSED ({pausedJobs.length})
                {abandonedCount > 0 && (
                  <span className="text-muted-foreground ml-2">· {abandonedCount} abandoned</span>
                )}
              </div>
              {pausedJobs.map((job) => (
                <JobRow 
                  key={job.id} 
                  job={job} 
                  onOpenDetail={setSelectedJob}
                  onMarkStalled={onMarkStalled}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
          
          {(hasRunningJobs || hasPausedJobs) && hasRecentJobs && <Separator />}
          
          {hasRecentJobs && (
            <div>
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0">
                RECENT (24h)
              </div>
              {recentJobs.map((job) => (
                <JobRow 
                  key={job.id} 
                  job={job} 
                  onOpenDetail={setSelectedJob}
                  onMarkStalled={onMarkStalled}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <JobDetailModal 
        job={selectedJob} 
        onClose={() => setSelectedJob(null)} 
      />
    </>
  );
}
