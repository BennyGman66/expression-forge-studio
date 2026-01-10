import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchBarProps {
  selectedCount: number;
  attemptsPerView: number;
  model: string;
  onAttemptsChange: (n: number) => void;
  onModelChange: (model: string) => void;
  onRunBatch: () => void;
  onClearSelection: () => void;
  isRunning: boolean;
}

const ATTEMPT_PRESETS = [2, 4, 6];

const MODELS = [
  { id: 'google/gemini-2.5-flash-image-preview', label: 'Nano-Banana-Pro' },
];

export function BatchBar({
  selectedCount,
  attemptsPerView,
  model,
  onAttemptsChange,
  onModelChange,
  onRunBatch,
  onClearSelection,
  isRunning,
}: BatchBarProps) {
  const totalRenders = selectedCount * attemptsPerView;
  const isVisible = selectedCount > 0;

  if (!isVisible) return null;

  return (
    <div className={cn(
      "sticky top-0 z-20 bg-card border-b border-border shadow-sm",
      "px-4 py-3 flex items-center gap-4 flex-wrap"
    )}>
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {selectedCount} views selected
        </Badge>
        <span className="text-sm text-muted-foreground">
          • {totalRenders} total renders
        </span>
      </div>

      <div className="flex-1" />

      {/* Model selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Model:</span>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map(m => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Attempts selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Attempts:</span>
        <div className="flex gap-1">
          {ATTEMPT_PRESETS.map(n => (
            <Button
              key={n}
              variant={attemptsPerView === n ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0 text-xs"
              onClick={() => onAttemptsChange(n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={onClearSelection}
          disabled={isRunning}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>

        <Button
          size="sm"
          className="h-8 gap-1.5 px-4"
          onClick={onRunBatch}
          disabled={isRunning || selectedCount === 0}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run Batch
        </Button>
      </div>
    </div>
  );
}
