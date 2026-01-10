import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Save, 
  Download, 
  Send, 
  AlertTriangle, 
  Check, 
  Loader2,
  Play,
  Settings2
} from "lucide-react";
import { VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplyLook, AIApplySettings } from "@/types/ai-apply";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

interface AIApplyActionsPanelProps {
  look: AIApplyLook | null;
  talentName: string | null;
  talentImageUrl: string | null;
  settings: AIApplySettings;
  onSettingsChange: (settings: AIApplySettings) => void;
  onRunAll: () => void;
  onSave: () => void;
  onDownload: () => void;
  onSendToJobBoard: () => void;
  isSaving: boolean;
  isRunningAll: boolean;
  pendingQueueCount: number;
}

export function AIApplyActionsPanel({
  look,
  talentName,
  talentImageUrl,
  settings,
  onSettingsChange,
  onRunAll,
  onSave,
  onDownload,
  onSendToJobBoard,
  isSaving,
  isRunningAll,
  pendingQueueCount,
}: AIApplyActionsPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedCount = look 
    ? VIEW_TYPES.filter(v => look.views[v]?.hasSelection).length 
    : 0;
  const allSelected = selectedCount === VIEW_TYPES.length;

  // Count views that can be run
  const runnableViews = look 
    ? VIEW_TYPES.filter(v => look.views[v]?.pairing?.canRun && look.views[v]?.status === 'not_started')
    : [];

  // Count views needing human fix
  const needsHumanFix = look
    ? VIEW_TYPES.filter(v => {
        const vs = look.views[v];
        return vs?.outputs.some(o => o.needs_human_fix);
      })
    : [];

  return (
    <div className="w-80 flex-shrink-0 border-l border-border flex flex-col bg-muted/30">
      {/* Talent info */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          {talentImageUrl ? (
            <img 
              src={talentImageUrl} 
              alt={talentName || 'Talent'}
              className="w-12 h-12 rounded-full object-cover border"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border">
              <span className="text-lg font-medium text-muted-foreground">
                {talentName?.[0] || '?'}
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{talentName || 'Unknown Talent'}</p>
            <p className="text-xs text-muted-foreground">AI Face Apply</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Current look progress */}
          {look && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">{look.name}</h4>
              
              <div className="grid grid-cols-2 gap-2">
                {VIEW_TYPES.map(viewType => {
                  const vs = look.views[viewType];
                  return (
                    <div 
                      key={viewType}
                      className="flex items-center gap-2 text-xs p-2 rounded bg-background border"
                    >
                      {vs?.hasSelection ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : vs?.status === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                      ) : vs?.status === 'failed' ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <span className="truncate">
                        {VIEW_LABELS[viewType as ViewType]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <Badge variant={allSelected ? 'default' : 'secondary'}>
                  {selectedCount}/{VIEW_TYPES.length} selected
                </Badge>
              </div>
            </div>
          )}

          <Separator />

          {/* Warnings */}
          {look?.warnings && look.warnings.length > 0 && (
            <>
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Warnings
                </h4>
                {look.warnings.map((warning, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-amber-500/10 p-2 rounded">
                    {warning}
                  </p>
                ))}
              </div>
              <Separator />
            </>
          )}

          {/* Queue status */}
          {pendingQueueCount > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span>{pendingQueueCount} tasks in queue</span>
              </div>
              <Separator />
            </>
          )}

          {/* Settings */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                <Settings2 className="h-4 w-4" />
                Advanced Settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Attempts per view</label>
                <Select 
                  value={String(settings.attemptsPerView)}
                  onValueChange={(v) => onSettingsChange({ ...settings, attemptsPerView: parseInt(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 6, 8].map(n => (
                      <SelectItem key={n} value={String(n)}>{n} attempts</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Strictness</label>
                <Select 
                  value={settings.strictness}
                  onValueChange={(v) => onSettingsChange({ ...settings, strictness: v as any })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High (default)</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        {runnableViews.length > 0 && (
          <Button 
            className="w-full gap-2" 
            onClick={onRunAll}
            disabled={isRunningAll}
          >
            {isRunningAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run All Views ({runnableViews.length})
          </Button>
        )}

        <Button 
          className="w-full gap-2" 
          onClick={onSave}
          disabled={!allSelected || isSaving}
          variant={allSelected ? 'default' : 'secondary'}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Selections
        </Button>

        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 gap-1"
            onClick={onDownload}
            disabled={selectedCount === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1 gap-1"
            onClick={onSendToJobBoard}
            disabled={needsHumanFix.length === 0 && look?.isReady}
          >
            <Send className="h-3.5 w-3.5" />
            Job Board
          </Button>
        </div>

        {needsHumanFix.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center">
            {needsHumanFix.length} view(s) flagged for human review
          </p>
        )}
      </div>
    </div>
  );
}
