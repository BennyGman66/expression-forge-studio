import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, X, Clock } from "lucide-react";
import { LookWithViews, VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LookOverviewPanelProps {
  looks: LookWithViews[];
  selectedLookId: string | null;
  selectedView: string | null;
  onSelectView: (lookId: string, view: string) => void;
}

function ViewStatusDot({ 
  status, 
  hasSelection 
}: { 
  status: 'not_started' | 'running' | 'completed' | 'failed' | 'needs_selection';
  hasSelection: boolean;
}) {
  if (status === 'not_started') {
    return <span className="w-3 h-3 rounded-full bg-muted" />;
  }
  if (status === 'running') {
    return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
  }
  if (status === 'failed') {
    return <AlertCircle className="w-3 h-3 text-red-500" />;
  }
  if (hasSelection) {
    return <Check className="w-3 h-3 text-green-500" />;
  }
  return <Clock className="w-3 h-3 text-yellow-500" />;
}

export function LookOverviewPanel({
  looks,
  selectedLookId,
  selectedView,
  onSelectView,
}: LookOverviewPanelProps) {
  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm">Products</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {looks.length} products · {looks.filter(l => l.isReady).length} ready
        </p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {looks.map(look => (
            <div key={look.id} className="space-y-1">
              {/* Look header */}
              <div className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium",
                selectedLookId === look.id ? "bg-accent" : ""
              )}>
                <div className="truncate">{look.name}</div>
                
                {/* View grid - 4 clickable dots */}
                <div className="flex gap-2 mt-2">
                  {VIEW_TYPES.map(view => {
                    const viewStatus = look.views[view];
                    const isSelected = selectedLookId === look.id && selectedView === view;
                    
                    return (
                      <button
                        key={view}
                        onClick={() => onSelectView(look.id, view)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-1.5 rounded transition-colors min-w-[50px]",
                          isSelected 
                            ? "bg-primary/10 ring-1 ring-primary" 
                            : "hover:bg-muted"
                        )}
                        title={`${VIEW_LABELS[view]}: ${viewStatus?.status || 'not_started'}`}
                      >
                        <ViewStatusDot 
                          status={viewStatus?.status || 'not_started'} 
                          hasSelection={viewStatus?.hasSelection || false}
                        />
                        <span className="text-[10px] text-muted-foreground truncate">
                          {view.split('_')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}