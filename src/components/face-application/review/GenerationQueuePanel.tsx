import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  Check, Loader2, AlertCircle, X, Trash2, ListOrdered 
} from "lucide-react";
import { QueueItem } from "@/hooks/useGenerationQueue";
import { cn } from "@/lib/utils";

interface GenerationQueuePanelProps {
  queue: QueueItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onClearCompleted: () => void;
}

export function GenerationQueuePanel({
  queue,
  onRemove,
  onClear,
  onClearCompleted,
}: GenerationQueuePanelProps) {
  if (queue.length === 0) return null;

  const pendingCount = queue.filter(q => q.status === 'queued').length;
  const processingCount = queue.filter(q => q.status === 'processing').length;
  const completedCount = queue.filter(q => q.status === 'completed').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;

  return (
    <Card className="mb-4">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Queue
              {pendingCount > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({pendingCount} pending)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(completedCount > 0 || failedCount > 0) && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 px-2 text-xs"
                onClick={onClearCompleted}
              >
                Clear Done
              </Button>
            )}
            {pendingCount > 0 && (
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onClear}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="py-2 px-3 max-h-48 overflow-y-auto">
        <div className="space-y-1">
          {queue.map(item => (
            <div 
              key={item.id} 
              className={cn(
                "flex items-center justify-between py-1.5 px-2 rounded text-xs",
                item.status === 'processing' && "bg-blue-500/10",
                item.status === 'completed' && "bg-green-500/10 opacity-60",
                item.status === 'failed' && "bg-red-500/10"
              )}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {item.status === 'processing' && (
                  <Loader2 className="h-3 w-3 text-blue-500 animate-spin flex-shrink-0" />
                )}
                {item.status === 'queued' && (
                  <div className="h-3 w-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                )}
                {item.status === 'completed' && (
                  <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                )}
                {item.status === 'failed' && (
                  <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                )}
                <span className="truncate" title={item.error || undefined}>
                  <span className="font-medium">{item.lookName}</span>
                  <span className="text-muted-foreground"> / {item.viewLabel}</span>
                  {item.status === 'failed' && item.error && (
                    <span className="text-red-500 ml-1">— {item.error}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={cn(
                  "text-[10px] uppercase px-1 rounded",
                  item.type === 'regenerate' ? "bg-muted" : "bg-primary/10 text-primary"
                )}>
                  {item.type === 'regenerate' ? 'regen' : 'new'}
                </span>
                {item.status === 'queued' && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-5 w-5 p-0"
                    onClick={() => onRemove(item.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
