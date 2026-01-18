import { useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LookRow } from './LookRow';
import { WorkflowLookWithDetails, WorkflowStage, STAGE_CONFIG, WORKFLOW_STAGES } from '@/types/optimised-workflow';

interface LooksDashboardTableProps {
  looks: WorkflowLookWithDetails[];
  isLoading: boolean;
  selectedLookIds: Set<string>;
  onSelectLook: (lookId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectByStage: (stage: WorkflowStage) => void;
  projectId: string;
}

export function LooksDashboardTable({
  looks,
  isLoading,
  selectedLookIds,
  onSelectLook,
  onSelectAll,
  onSelectNone,
  onSelectByStage,
  projectId,
}: LooksDashboardTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: looks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Count looks by stage for the dropdown
  const stageCount = useMemo(() => {
    return WORKFLOW_STAGES.reduce((acc, stage) => {
      acc[stage] = looks.filter(l => l.stage === stage).length;
      return acc;
    }, {} as Record<WorkflowStage, number>);
  }, [looks]);

  const allSelected = looks.length > 0 && selectedLookIds.size === looks.length;
  const someSelected = selectedLookIds.size > 0 && selectedLookIds.size < looks.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (looks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-foreground mb-2">No looks yet</p>
        <p className="text-muted-foreground">
          Drop a folder of images above to get started
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table Header */}
      <div className="flex items-center px-6 py-3 border-b bg-muted/50 text-sm font-medium text-muted-foreground">
        <div className="w-10 flex items-center">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => {
              if (checked) {
                onSelectAll();
              } else {
                onSelectNone();
              }
            }}
            aria-label="Select all"
            className={someSelected ? 'data-[state=checked]:bg-primary' : ''}
          />
        </div>
        <div className="flex-1 min-w-[200px]">Look Code</div>
        <div className="w-32">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground">
                Stage
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {WORKFLOW_STAGES.map(stage => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => onSelectByStage(stage)}
                  disabled={stageCount[stage] === 0}
                >
                  <span className={`w-2 h-2 rounded-full mr-2 ${STAGE_CONFIG[stage].bgColor}`} />
                  {STAGE_CONFIG[stage].shortLabel}
                  <span className="ml-auto text-muted-foreground">
                    {stageCount[stage]}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="w-32">Views</div>
        <div className="w-40">Model</div>
        <div className="w-28">Updated</div>
        <div className="w-40">Issues</div>
        <div className="w-10" />
      </div>

      {/* Virtualized Table Body */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const look = looks[virtualRow.index];
            return (
              <div
                key={look.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LookRow
                  look={look}
                  isSelected={selectedLookIds.has(look.id)}
                  onSelect={(selected) => onSelectLook(look.id, selected)}
                  projectId={projectId}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
