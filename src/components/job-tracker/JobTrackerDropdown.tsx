import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { JobRow } from './JobRow';
import { JobDetailModal } from './JobDetailModal';
import { useState } from 'react';
import type { PipelineJob } from '@/types/pipeline-jobs';

interface JobTrackerDropdownProps {
  activeJobs: PipelineJob[];
  recentJobs: PipelineJob[];
}

export function JobTrackerDropdown({ activeJobs, recentJobs }: JobTrackerDropdownProps) {
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);

  const hasActiveJobs = activeJobs.length > 0;
  const hasRecentJobs = recentJobs.length > 0;
  const isEmpty = !hasActiveJobs && !hasRecentJobs;

  return (
    <>
      <div className="w-80 max-h-[480px] flex flex-col">
        <ScrollArea className="flex-1">
          {isEmpty && (
            <div className="p-6 text-center text-muted-foreground">
              <p className="text-sm">No active or recent jobs</p>
              <p className="text-xs mt-1">Jobs will appear here when you start generation tasks</p>
            </div>
          )}
          
          {hasActiveJobs && (
            <div>
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0">
                ACTIVE ({activeJobs.length})
              </div>
              {activeJobs.map((job) => (
                <JobRow 
                  key={job.id} 
                  job={job} 
                  onOpenDetail={setSelectedJob}
                />
              ))}
            </div>
          )}
          
          {hasActiveJobs && hasRecentJobs && <Separator />}
          
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
