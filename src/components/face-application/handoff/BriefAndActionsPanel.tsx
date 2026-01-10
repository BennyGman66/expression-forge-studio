import React from 'react';
import { Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { HandoffSummary, DEFAULT_BRIEF } from '@/types/job-handoff';
import { cn } from '@/lib/utils';

interface BriefAndActionsPanelProps {
  brief: string;
  onBriefChange: (brief: string) => void;
  summary: HandoffSummary;
  onSend: () => void;
  isSending: boolean;
  canSend: boolean;
}

export function BriefAndActionsPanel({
  brief,
  onBriefChange,
  summary,
  onSend,
  isSending,
  canSend,
}: BriefAndActionsPanelProps) {
  const hasBlockingIssues = summary.blockingLooks > 0;
  const hasBrief = brief.trim().length > 0;
  const hasJobsToSend = summary.totalJobs > 0;

  const sendDisabled = !canSend || isSending || !hasBrief || !hasJobsToSend;

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Production Brief */}
      <Card className="m-3 flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Production Brief
            {!hasBrief && (
              <span className="text-destructive text-xs font-normal">(Required)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            placeholder="Enter production brief for freelancers..."
            className="min-h-[180px] resize-none text-sm"
          />
          {!brief && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs h-7"
              onClick={() => onBriefChange(DEFAULT_BRIEF)}
            >
              Use default template
            </Button>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Summary Stats */}
      <div className="p-3 space-y-2">
        <h4 className="text-sm font-medium mb-2">Summary</h4>
        
        <SummaryRow
          icon={CheckCircle2}
          label="Ready to send"
          value={summary.readyLooks}
          variant="success"
        />
        <SummaryRow
          icon={Clock}
          label="Incomplete"
          value={summary.incompleteLooks}
          variant="warning"
          sublabel="(not blocking)"
        />
        {summary.blockingLooks > 0 && (
          <SummaryRow
            icon={AlertCircle}
            label="Blocking issues"
            value={summary.blockingLooks}
            variant="error"
          />
        )}
        
        <Separator className="my-3" />
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Jobs to create:</span>
          <span className="font-semibold text-lg">{summary.totalJobs}</span>
        </div>
      </div>

      {/* Validation Messages */}
      {!canSend && (
        <div className="px-3 pb-2">
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {!hasBrief && <p>• Production brief is required</p>}
            {!hasJobsToSend && <p>• Select at least one ready look</p>}
          </div>
        </div>
      )}

      {/* Send Button */}
      <div className="p-3 border-t border-border">
        <Button
          onClick={onSend}
          disabled={sendDisabled}
          className="w-full"
          size="lg"
        >
          {isSending ? (
            <>
              <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              Creating Jobs...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send to Job Board
            </>
          )}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2">
          This action is irreversible
        </p>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  icon: React.ElementType;
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'error';
  sublabel?: string;
}

function SummaryRow({ icon: Icon, label, value, variant, sublabel }: SummaryRowProps) {
  const colorClasses = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-destructive',
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", colorClasses[variant])} />
        <span className="text-muted-foreground">
          {label}
          {sublabel && <span className="text-xs ml-1">{sublabel}</span>}
        </span>
      </div>
      <span className={cn("font-medium", colorClasses[variant])}>{value}</span>
    </div>
  );
}
