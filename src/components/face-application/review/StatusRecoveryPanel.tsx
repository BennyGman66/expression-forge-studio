import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Check, Loader2, RefreshCw, AlertCircle, Save, Download
} from "lucide-react";
import { LookWithViews, VIEW_TYPES, VIEW_LABELS, ViewType, ViewStatus } from "@/types/face-application";
import { GenerationQueuePanel } from "./GenerationQueuePanel";
import { QueueItem } from "@/hooks/useGenerationQueue";

interface StatusRecoveryPanelProps {
  look: LookWithViews | null;
  selectedView: string | null;
  viewStatus: ViewStatus | null;
  talentName: string | null;
  talentImageUrl: string | null;
  onResumeView: () => void;
  onSaveToLook: () => void;
  onDownloadSelected: () => void;
  isResuming: boolean;
  isSaving: boolean;
  queue: QueueItem[];
  onRemoveFromQueue: (id: string) => void;
  onClearQueue: () => void;
  onClearCompleted: () => void;
}

export function StatusRecoveryPanel({
  look,
  selectedView,
  viewStatus,
  talentName,
  talentImageUrl,
  onResumeView,
  onSaveToLook,
  onDownloadSelected,
  isResuming,
  isSaving,
  queue,
  onRemoveFromQueue,
  onClearQueue,
  onClearCompleted,
}: StatusRecoveryPanelProps) {
  if (!look) {
    return (
      <div className="w-72 border-l p-4 flex flex-col">
        <div className="text-sm text-muted-foreground">
          Select a product to view details
        </div>
      </div>
    );
  }

  // Calculate look-level stats
  const viewsWithSelection = VIEW_TYPES.filter(v => look.views[v]?.hasSelection).length;
  const viewsCompleted = VIEW_TYPES.filter(v => look.views[v]?.status === 'completed' || look.views[v]?.status === 'needs_selection').length;
  const viewsFailed = VIEW_TYPES.filter(v => look.views[v]?.status === 'failed').length;
  const viewsRunning = VIEW_TYPES.filter(v => look.views[v]?.status === 'running').length;

  return (
    <div className="w-72 border-l flex flex-col overflow-hidden">
      {/* Generation Queue */}
      <div className="p-3 border-b flex-shrink-0">
        <GenerationQueuePanel
          queue={queue}
          onRemove={onRemoveFromQueue}
          onClear={onClearQueue}
          onClearCompleted={onClearCompleted}
        />
      </div>

      {/* Talent Info */}
      <div className="p-4 border-b flex-shrink-0">
        <div className="text-xs text-muted-foreground mb-2">Digital Talent</div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
            {talentImageUrl ? (
              <img src={talentImageUrl} alt={talentName || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">N/A</div>
            )}
          </div>
          <div>
            <div className="font-medium text-sm">{talentName || 'Unknown'}</div>
          </div>
        </div>
      </div>

      {/* Current View Status */}
      {selectedView && viewStatus && (
        <div className="p-4 border-b">
          <div className="text-xs text-muted-foreground mb-2">Current View</div>
          <div className="font-medium mb-2">
            {VIEW_LABELS[selectedView as ViewType] || selectedView}
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="capitalize">{viewStatus.status.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span>{viewStatus.completedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed</span>
              <span className={viewStatus.failedCount > 0 ? "text-red-500" : ""}>{viewStatus.failedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selection</span>
              <span>{viewStatus.hasSelection ? (
                <Check className="h-4 w-4 text-green-500 inline" />
              ) : (
                <span className="text-yellow-500">Needed</span>
              )}</span>
            </div>
          </div>

          {/* Recovery action */}
          {(viewStatus.status === 'failed' || viewStatus.failedCount > 0) && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3"
              onClick={onResumeView}
              disabled={isResuming}
            >
              {isResuming ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Retry Failed
            </Button>
          )}
        </div>
      )}

      {/* Look Progress */}
      <div className="p-4 border-b">
        <div className="text-xs text-muted-foreground mb-2">Product Progress</div>
        <div className="font-medium text-sm mb-3 truncate">{look.name}</div>
        
        {/* View checklist */}
        <div className="space-y-2">
          {VIEW_TYPES.map(view => {
            const vs = look.views[view];
            const hasSelection = vs?.hasSelection;
            const isComplete = vs?.status === 'completed' || vs?.status === 'needs_selection';
            const isFailed = vs?.status === 'failed';
            const isRunning = vs?.status === 'running';

            return (
              <div key={view} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{VIEW_LABELS[view]}</span>
                <div className="flex items-center gap-2">
                  {isRunning ? (
                    <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  ) : isFailed ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : hasSelection ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : isComplete ? (
                    <Badge variant="outline" className="text-xs py-0">Select</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Ready indicator */}
        <div className="mt-4 pt-3 border-t">
          {look.isReady ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <Check className="h-4 w-4" />
              <span>Ready for job creation</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {viewsWithSelection}/4 views selected
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 mt-auto space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={onDownloadSelected}
          disabled={viewsWithSelection === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Download Selected
        </Button>
        
        <Button
          size="sm"
          className="w-full"
          onClick={onSaveToLook}
          disabled={!look.isReady || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save to Look
        </Button>
      </div>
    </div>
  );
}