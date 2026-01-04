import { useNavigate } from 'react-router-dom';
import { ExternalLink, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JobTypeBadge } from './JobTypeBadge';
import { JOB_STATUS_CONFIG, type PipelineJob } from '@/types/pipeline-jobs';
import { format, formatDistanceToNow } from 'date-fns';

interface EnhancedPipelineJob extends PipelineJob {
  isStalled?: boolean;
}

interface JobDetailModalProps {
  job: EnhancedPipelineJob | null;
  onClose: () => void;
  onMarkStalled?: (jobId: string) => void;
}

export function JobDetailModal({ job, onClose, onMarkStalled }: JobDetailModalProps) {
  const navigate = useNavigate();

  if (!job) return null;

  const progressPercent = job.progress_total > 0
    ? Math.round((job.progress_done / job.progress_total) * 100)
    : 0;
  
  const statusConfig = JOB_STATUS_CONFIG[job.status];
  const remaining = job.progress_total - job.progress_done - job.progress_failed;
  const timeAgo = formatDistanceToNow(new Date(job.updated_at), { addSuffix: true });

  const handleOpenOrigin = () => {
    navigate(job.origin_route);
    onClose();
  };

  const handleResume = () => {
    const url = new URL(job.origin_route, window.location.origin);
    url.searchParams.set('resumeJobId', job.id);
    navigate(url.pathname + url.search);
    onClose();
  };

  const handleMarkFailed = () => {
    onMarkStalled?.(job.id);
    onClose();
  };

  return (
    <Dialog open={!!job} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <JobTypeBadge type={job.type} />
            <DialogTitle className="text-lg">{job.title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stalled Warning */}
          {job.isStalled && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Job Stalled</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This job hasn't been updated {timeAgo}. The browser tab may have been closed or navigated away.
                </p>
              </div>
            </div>
          )}

          {/* Status & Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {job.isStalled && (
                  <Badge variant="destructive">Stalled</Badge>
                )}
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {progressPercent}% complete
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Progress breakdown */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-semibold">{job.progress_total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2">
              <div className="text-lg font-semibold text-green-600">{job.progress_done}</div>
              <div className="text-xs text-muted-foreground">Done</div>
            </div>
            <div className="bg-destructive/10 rounded-lg p-2">
              <div className="text-lg font-semibold text-destructive">{job.progress_failed}</div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="text-lg font-semibold">{remaining}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>

          {/* Message */}
          {job.progress_message && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              {job.progress_message}
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Started: {job.started_at ? format(new Date(job.started_at), 'PPp') : 'Not started'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last updated: {timeAgo}</span>
            </div>
            {job.completed_at && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Completed: {format(new Date(job.completed_at), 'PPp')}</span>
              </div>
            )}
          </div>

          {/* Context */}
          {Object.keys(job.origin_context).length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">CONTEXT</div>
              <ScrollArea className="max-h-24">
                <pre className="text-xs bg-muted rounded p-2 overflow-auto">
                  {JSON.stringify(job.origin_context, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {job.isStalled ? (
              <>
                <Button onClick={handleResume} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Resume Job
                </Button>
                <Button variant="outline" onClick={handleMarkFailed}>
                  Mark as Failed
                </Button>
              </>
            ) : (
              <>
                <Button onClick={handleOpenOrigin} className="flex-1">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Origin
                </Button>
                {job.progress_failed > 0 && job.supports_retry && (
                  <Button variant="outline">
                    Retry {job.progress_failed} Failed
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
