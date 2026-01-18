import { WorkflowStage, STAGE_CONFIG } from '@/types/optimised-workflow';
import { cn } from '@/lib/utils';

interface StagePillProps {
  stage: WorkflowStage;
  size?: 'sm' | 'md';
}

export function StagePill({ stage, size = 'sm' }: StagePillProps) {
  const config = STAGE_CONFIG[stage];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.bgColor,
        config.color,
        config.borderColor,
        'border',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      )}
    >
      {config.shortLabel}
    </span>
  );
}
