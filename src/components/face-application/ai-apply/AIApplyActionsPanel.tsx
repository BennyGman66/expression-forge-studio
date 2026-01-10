import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Send, 
  Loader2,
  Play,
  ChevronDown,
} from "lucide-react";
import { VIEW_TYPES, VIEW_LABELS, ViewType } from "@/types/face-application";
import type { AIApplyLook } from "@/types/ai-apply";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

interface AIApplyActionsPanelProps {
  look: AIApplyLook | null;
  talentName: string | null;
  talentImageUrl: string | null;
  bodyImageUrl: string | null;
  selectedView: string | null;
  onRunView: () => void;
  onRunAll: () => void;
  onSendToJobBoard: () => void;
  isRunning: boolean;
}

// Read-only prompt preview
const PROMPT_PREVIEW = `Apply the provided head/face to the body while maintaining exact clothing, pose, and proportions. Preserve facial identity precisely. Output should be photorealistic and seamless.`;

export function AIApplyActionsPanel({
  look,
  talentName,
  talentImageUrl,
  bodyImageUrl,
  selectedView,
  onRunView,
  onRunAll,
  onSendToJobBoard,
  isRunning,
}: AIApplyActionsPanelProps) {
  const [promptOpen, setPromptOpen] = useState(false);

  // Count views that can be run
  const runnableViews = look 
    ? VIEW_TYPES.filter(v => look.views[v]?.pairing?.canRun && look.views[v]?.status === 'not_started')
    : [];

  const currentViewStatus = look && selectedView ? look.views[selectedView] : null;
  const canRunCurrentView = currentViewStatus?.pairing?.canRun && currentViewStatus?.status === 'not_started';

  return (
    <div className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-muted/30">
      {/* Head Reference */}
      <div className="p-4 border-b border-border">
        <p className="text-xs text-muted-foreground font-medium mb-2">HEAD REFERENCE</p>
        <div className="flex items-center gap-3">
          {talentImageUrl ? (
            <img 
              src={talentImageUrl} 
              alt={talentName || 'Talent'}
              className="w-14 h-14 rounded-lg object-cover border"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border">
              <span className="text-lg font-medium text-muted-foreground">
                {talentName?.[0] || '?'}
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">{talentName || 'Unknown Talent'}</p>
            <p className="text-xs text-muted-foreground">Digital Talent</p>
          </div>
        </div>
      </div>

      {/* Body Reference */}
      <div className="p-4 border-b border-border">
        <p className="text-xs text-muted-foreground font-medium mb-2">BODY REFERENCE</p>
        <div className="flex items-center gap-3">
          {bodyImageUrl ? (
            <img 
              src={bodyImageUrl} 
              alt="Body"
              className="w-14 h-14 rounded-lg object-cover border"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center border">
              <span className="text-xs text-muted-foreground text-center px-1">No body</span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium">
              {selectedView ? VIEW_LABELS[selectedView as ViewType] || selectedView : 'No view'}
            </p>
            <p className="text-xs text-muted-foreground">Current View</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Prompt Preview */}
          <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground font-medium py-2 hover:text-foreground transition-colors">
              <span>PROMPT</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground leading-relaxed">
                {PROMPT_PREVIEW}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-3">
        {/* Run View */}
        {canRunCurrentView && (
          <Button 
            className="w-full gap-2" 
            variant="outline"
            onClick={onRunView}
            disabled={isRunning}
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run View
          </Button>
        )}

        {/* Run All Views */}
        {runnableViews.length > 0 && (
          <Button 
            className="w-full gap-2" 
            onClick={onRunAll}
            disabled={isRunning}
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run All Views ({runnableViews.length})
          </Button>
        )}

        <Separator />

        {/* Send to Job Board */}
        <Button 
          variant="outline"
          className="w-full gap-2"
          onClick={onSendToJobBoard}
        >
          <Send className="h-4 w-4" />
          Send to Job Board
        </Button>
      </div>
    </div>
  );
}