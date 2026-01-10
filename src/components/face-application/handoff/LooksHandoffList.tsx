import React from 'react';
import { Check, Minus, AlertTriangle, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  LookHandoffStatus, 
  REQUIRED_VIEWS, 
  VIEW_LABELS,
  HandoffSummary 
} from '@/types/job-handoff';

interface LooksHandoffListProps {
  looks: LookHandoffStatus[];
  summary: HandoffSummary;
  selectedLookId: string | null;
  onSelectLook: (lookId: string) => void;
  onToggleInclusion: (lookId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function LooksHandoffList({
  looks,
  summary,
  selectedLookId,
  onSelectLook,
  onToggleInclusion,
  onSelectAll,
  onDeselectAll,
}: LooksHandoffListProps) {
  const includedCount = looks.filter(l => l.isIncluded).length;

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">LOOKS ({looks.length})</h3>
          <Badge variant="secondary" className="text-xs">
            {includedCount} selected
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs px-2"
            onClick={onSelectAll}
          >
            Select All Ready
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 text-xs px-2"
            onClick={onDeselectAll}
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="px-3 py-2 border-b border-border bg-background text-xs flex gap-3">
        <span className="text-green-600">✓ {summary.readyLooks} ready</span>
        <span className="text-yellow-600">◐ {summary.incompleteLooks} incomplete</span>
        {summary.blockingLooks > 0 && (
          <span className="text-destructive">⚠ {summary.blockingLooks} blocking</span>
        )}
      </div>

      {/* Look list */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {looks.map((look) => (
            <LookRow
              key={look.id}
              look={look}
              isSelected={selectedLookId === look.id}
              onSelect={() => onSelectLook(look.id)}
              onToggleInclusion={() => onToggleInclusion(look.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface LookRowProps {
  look: LookHandoffStatus;
  isSelected: boolean;
  onSelect: () => void;
  onToggleInclusion: () => void;
}

function LookRow({ look, isSelected, onSelect, onToggleInclusion }: LookRowProps) {
  const statusConfig = {
    ready: { 
      label: 'Ready', 
      className: 'bg-green-500/10 text-green-600 border-green-500/30',
      dotColor: 'bg-green-500'
    },
    incomplete: { 
      label: 'Incomplete', 
      className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
      dotColor: 'bg-yellow-500'
    },
    blocking: { 
      label: 'Blocking', 
      className: 'bg-destructive/10 text-destructive border-destructive/30',
      dotColor: 'bg-destructive'
    },
  };

  const config = statusConfig[look.status];

  return (
    <div
      className={cn(
        "p-2 rounded-md cursor-pointer transition-colors mb-1",
        isSelected 
          ? "bg-primary/10 border border-primary/30" 
          : "hover:bg-muted/50 border border-transparent"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox for inclusion */}
        <Checkbox
          checked={look.isIncluded}
          onCheckedChange={() => onToggleInclusion()}
          onClick={(e) => e.stopPropagation()}
          disabled={look.status === 'blocking'}
          className="mt-0.5"
        />

        <div className="flex-1 min-w-0">
          {/* Look name */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{look.name}</span>
            {look.isIncluded && (
              <Check className="h-3 w-3 text-primary flex-shrink-0" />
            )}
          </div>

          {/* View indicators */}
          <div className="flex items-center gap-1 mb-1">
            {REQUIRED_VIEWS.map((view) => {
              const viewStatus = look.views[view];
              return (
                <div
                  key={view}
                  className={cn(
                    "w-4 h-4 rounded-sm flex items-center justify-center text-[10px]",
                    viewStatus.hasSelection
                      ? "bg-green-500/20 text-green-600"
                      : "bg-muted text-muted-foreground"
                  )}
                  title={`${VIEW_LABELS[view]}: ${viewStatus.hasSelection ? 'Selected' : 'Missing'}`}
                >
                  {viewStatus.hasSelection ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    <Minus className="h-2.5 w-2.5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-1">
            <Badge 
              variant="outline" 
              className={cn("text-[10px] px-1.5 py-0 h-4", config.className)}
            >
              {look.status === 'blocking' && (
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
              )}
              {config.label}
            </Badge>
            {look.hasSentJob && (
              <Badge 
                variant="outline" 
                className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-600 border-blue-500/30"
              >
                <Send className="h-2 w-2 mr-0.5" />
                Sent
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
