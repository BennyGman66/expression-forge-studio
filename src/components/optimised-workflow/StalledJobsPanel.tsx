import { RefreshCw, X, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { WorkflowQueueItem } from '@/types/optimised-workflow';
import { useRetryQueueItem, useRetryAllStalled, useCancelQueueItem } from '@/hooks/useWorkflowQueue';
import { formatDistanceToNow } from 'date-fns';

interface StalledJobsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  stalledJobs: WorkflowQueueItem[];
}

export function StalledJobsPanel({
  open,
  onOpenChange,
  projectId,
  stalledJobs,
}: StalledJobsPanelProps) {
  const retryItem = useRetryQueueItem();
  const retryAll = useRetryAllStalled();
  const cancelItem = useCancelQueueItem();

  const handleRetryAll = () => {
    retryAll.mutate(projectId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Stalled Jobs
          </SheetTitle>
          <SheetDescription>
            Jobs that haven't received an update in over 10 minutes
          </SheetDescription>
        </SheetHeader>

        <div className="py-4">
          {stalledJobs.length > 0 && (
            <Button
              onClick={handleRetryAll}
              disabled={retryAll.isPending}
              className="w-full mb-4"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${retryAll.isPending ? 'animate-spin' : ''}`} />
              Retry All ({stalledJobs.length})
            </Button>
          )}

          <ScrollArea className="h-[calc(100vh-200px)]">
            {stalledJobs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No stalled jobs</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stalledJobs.map(job => (
                  <div
                    key={job.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge variant="outline" className="mb-2">
                          {job.job_type}
                        </Badge>
                        <p className="text-sm text-muted-foreground">
                          {job.view && `View: ${job.view}`}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                        Stalled
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Last heartbeat: {formatDistanceToNow(new Date(job.heartbeat_at), { addSuffix: true })}
                    </div>

                    {job.error_message && (
                      <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                        {job.error_message}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryItem.mutate(job.id)}
                        disabled={retryItem.isPending}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${retryItem.isPending ? 'animate-spin' : ''}`} />
                        Retry
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => cancelItem.mutate(job.id)}
                        disabled={cancelItem.isPending}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
