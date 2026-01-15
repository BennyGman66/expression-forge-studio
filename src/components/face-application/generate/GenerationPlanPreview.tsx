import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GenerationPlanPreviewProps {
  selectedLooksCount: number;
  totalViewsToGenerate: number;
  outputsToGenerate: number;
  existingOutputsCount: number;
  allowRegenerate: boolean;
  onAllowRegenerateChange: (allow: boolean) => void;
  requiredOptions: number;
  isGenerating?: boolean;
}

export function GenerationPlanPreview({
  selectedLooksCount,
  totalViewsToGenerate,
  outputsToGenerate,
  existingOutputsCount,
  allowRegenerate,
  onAllowRegenerateChange,
  requiredOptions,
  isGenerating = false,
}: GenerationPlanPreviewProps) {
  const hasExistingOutputs = existingOutputsCount > 0;

  return (
    <Card className={cn(
      "border-2",
      outputsToGenerate > 0 ? "border-primary/50 bg-primary/5" : "border-muted"
    )}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          {/* Main summary */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-semibold text-lg">Generation Plan</span>
            </div>
            
            {outputsToGenerate > 0 ? (
              <p className="text-sm text-muted-foreground">
                You are about to generate{" "}
                <span className="font-semibold text-foreground">{outputsToGenerate} outputs</span>
                {" "}across{" "}
                <span className="font-semibold text-foreground">{selectedLooksCount} looks</span>
                {" "}and{" "}
                <span className="font-semibold text-foreground">{totalViewsToGenerate} views</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                All selected views are already complete ({requiredOptions} options each)
              </p>
            )}

            {/* Warning about existing outputs */}
            {hasExistingOutputs && !allowRegenerate && outputsToGenerate > 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                {existingOutputsCount} existing outputs will be kept (only missing options generated)
              </p>
            )}
          </div>

          {/* Stats badges */}
          <div className="flex flex-col gap-2 items-end">
            <Badge variant="outline" className="h-8 px-3 text-base font-bold">
              {outputsToGenerate} new
            </Badge>
            {existingOutputsCount > 0 && (
              <span className="text-xs text-muted-foreground">
                + {existingOutputsCount} existing
              </span>
            )}
          </div>
        </div>

        {/* Re-generate checkbox */}
        {hasExistingOutputs && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Checkbox
              id="allow-regenerate"
              checked={allowRegenerate}
              onCheckedChange={(checked) => onAllowRegenerateChange(checked === true)}
              disabled={isGenerating}
            />
            <Label 
              htmlFor="allow-regenerate" 
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Allow re-generating even if outputs already exist
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
