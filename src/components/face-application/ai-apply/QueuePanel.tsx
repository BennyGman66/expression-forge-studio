import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  X, 
  Loader2, 
  Check, 
  AlertCircle,
  RotateCcw,
  ChevronDown,
  Send,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { VIEW_LABELS } from "@/types/face-application";
import type { AIApplyQueueItem } from "@/types/ai-apply";

interface QueuePanelProps {
  queue: AIApplyQueueItem[];
  selectedViews: Set<string>;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onRemoveFromQueue: (id: string) => void;
  onRetryItem: (item: AIApplyQueueItem) => void;
  onCancelBatch: () => void;
  onSendToJobBoard: () => void;
}

function QueueItemStatus({ status }: { status: AIApplyQueueItem['status'] }) {
  switch (status) {
    case 'processing':
      return (
        <div className="flex items-center gap-1 text-blue-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-[10px]">Running</span>
        </div>
      );
    case 'completed':
      return (
        <div className="flex items-center gap-1 text-primary">
          <Check className="h-3 w-3" />
          <span className="text-[10px]">Done</span>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3" />
          <span className="text-[10px]">Failed</span>
        </div>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          Queued
        </Badge>
      );
  }
}

export function QueuePanel({
  queue,
  selectedViews,
  prompt,
  onPromptChange,
  onRemoveFromQueue,
  onRetryItem,
  onCancelBatch,
  onSendToJobBoard,
}: QueuePanelProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  const processingCount = queue.filter(q => q.status === 'processing').length;
  const queuedCount = queue.filter(q => q.status === 'queued').length;
  const completedCount = queue.filter(q => q.status === 'completed').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;

  const hasActiveItems = processingCount > 0 || queuedCount > 0;

  return (
    <div className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-muted/30">
      {/* Queue header */}
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold">Queue</h3>
        <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
          {queuedCount > 0 && <span>{queuedCount} queued</span>}
          {processingCount > 0 && <span className="text-blue-500">{processingCount} running</span>}
          {completedCount > 0 && <span className="text-primary">{completedCount} done</span>}
          {failedCount > 0 && <span className="text-destructive">{failedCount} failed</span>}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {queue.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {selectedViews.size > 0 
                  ? `${selectedViews.size} views ready to run`
                  : 'Select views and run batch'}
              </p>
            </div>
          ) : (
            queue.map(item => (
              <div 
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs",
                  "bg-card border border-border",
                  item.status === 'failed' && "border-destructive/50 bg-destructive/5"
                )}
              >
                <div className="flex-1 truncate">
                  <p className="font-medium truncate">{item.lookName}</p>
                  <p className="text-muted-foreground">
                    {item.view ? VIEW_LABELS[item.view] || item.view : 'All views'}
                  </p>
                </div>
                
                <QueueItemStatus status={item.status} />
                
                {/* Actions */}
                {item.status === 'failed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onRetryItem(item)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                {(item.status === 'queued' || item.status === 'failed') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveFromQueue(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Prompt editor */}
      <div className="border-t border-border">
        <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors">
            <span>PROMPT</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", promptOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              <Textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                placeholder="Enter your generation prompt..."
                className="text-xs min-h-[100px] resize-none bg-muted border-0 focus-visible:ring-1"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        {hasActiveItems && (
          <Button 
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={onCancelBatch}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel Batch
          </Button>
        )}
        
        <Button 
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={onSendToJobBoard}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Send to Job Board
        </Button>
      </div>
    </div>
  );
}
