import { useNavigate } from 'react-router-dom';
import { ExternalLink, Pause, Play, RotateCcw, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { JobTypeBadge } from './JobTypeBadge';
import { usePipelineJobs } from '@/hooks/usePipelineJobs';
import { 
  JOB_STATUS_CONFIG, 
  type PipelineJob 
} from '@/types/pipeline-jobs';
import { formatDistanceToNow } from 'date-fns';

interface EnhancedPipelineJob extends PipelineJob {
  isStalled?: boolean;
}

interface JobRowProps {
  job: EnhancedPipelineJob;
  onOpenDetail?: (job: PipelineJob) => void;
  onMarkStalled?: (jobId: string) => void;
  onResume?: (job: PipelineJob) => void;
}

export function JobRow({ job, onOpenDetail, onMarkStalled, onResume }: JobRowProps) {
  const navigate = useNavigate();
  const { pauseJob, resumeJob } = usePipelineJobs();
  
  const isActive = job.status === 'RUNNING' || job.status === 'QUEUED';
  const progressPercent = job.progress_total > 0 
    ? Math.round((job.progress_done / job.progress_total) * 100) 
    : 0;
  
  const statusConfig = JOB_STATUS_CONFIG[job.status];
  const timeAgo = formatDistanceToNow(new Date(job.updated_at), { addSuffix: true });

  const handleOpenOrigin = () => {
    navigate(job.origin_route);
  };

  const handleTogglePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (job.status === 'PAUSED') {
      await resumeJob(job.id);
    } else if (job.status === 'RUNNING') {
      await pauseJob(job.id);
    }
  };

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onResume) {
      onResume(job);
    } else {
      // Navigate to origin with resume param
      const url = new URL(job.origin_route, window.location.origin);
      url.searchParams.set('resumeJobId', job.id);
      navigate(url.pathname + url.search);
    }
  };

  const handleMarkStalled = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkStalled?.(job.id);
  };

  return (
    <div 
      className="p-3 hover:bg-muted/50 cursor-pointer transition-colors border-b last:border-b-0"
      onClick={() => onOpenDetail?.(job)}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <JobTypeBadge type={job.type} />
        <div className="flex items-center gap-1">
          {job.isStalled && (
            <Badge variant="destructive" className="text-[10px] px-2">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Stalled
            </Badge>
          )}
          <Badge variant={statusConfig.variant} className="text-[10px] px-2">
            {statusConfig.label}
          </Badge>
        </div>
      </div>
      <p className="text-sm font-medium truncate mb-1.5">{job.title}</p>
      
      {isActive && !job.isStalled && (
        <div className="mb-2">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-muted-foreground">
              {job.progress_done}/{job.progress_total} ({progressPercent}%)
            </span>
            {job.progress_message && (
              <span className="text-xs text-muted-foreground truncate ml-2">
                {job.progress_message}
              </span>
            )}
          </div>
        </div>
      )}

      {job.isStalled && (
        <div className="mb-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
          Not updated {timeAgo} · {job.progress_done}/{job.progress_total} completed
        </div>
      )}
      
      {!isActive && !job.isStalled && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span>
            {job.progress_done}/{job.progress_total}
            {job.progress_failed > 0 && (
              <span className="text-destructive ml-1">
                ({job.progress_failed} failed)
              </span>
            )}
          </span>
          <span>·</span>
          <span>{timeAgo}</span>
        </div>
      )}
      
      <div className="flex items-center gap-1">
        {job.isStalled && (
          <>
            <Button
              variant="default"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleResume}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Resume
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive"
              onClick={handleMarkStalled}
            >
              Mark Failed
            </Button>
          </>
        )}
        
        {job.supports_pause && isActive && !job.isStalled && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={handleTogglePause}
          >
            {job.status === 'PAUSED' ? (
              <>
                <Play className="h-3 w-3 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 mr-1" />
                Pause
              </>
            )}
          </Button>
        )}
        
        {job.progress_failed > 0 && job.supports_retry && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry Failed
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs ml-auto"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenOrigin();
          }}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Open
        </Button>
      </div>
    </div>
  );
}
