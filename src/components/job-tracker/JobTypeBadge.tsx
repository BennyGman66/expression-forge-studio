import { cn } from '@/lib/utils';
import { JOB_TYPE_CONFIG, type PipelineJobType } from '@/types/pipeline-jobs';

interface JobTypeBadgeProps {
  type: PipelineJobType;
  className?: string;
}

export function JobTypeBadge({ type, className }: JobTypeBadgeProps) {
  const config = JOB_TYPE_CONFIG[type];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white',
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
