import { Badge } from "@/components/ui/badge";
import { Lock, AlertTriangle, ArrowRight } from "lucide-react";
import { VIEW_LABELS, ViewType } from "@/types/face-application";
import type { ViewPairing } from "@/types/ai-apply";
import { cn } from "@/lib/utils";

interface PairingInspectorProps {
  pairing: ViewPairing | null;
  view: string;
}

export function PairingInspector({ pairing, view }: PairingInspectorProps) {
  if (!pairing) {
    return (
      <div className="p-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">Select a view to see pairing</p>
      </div>
    );
  }

  const viewLabel = VIEW_LABELS[view as ViewType] || view;

  return (
    <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Pairing for {viewLabel}</h4>
        {!pairing.canRun && (
          <Badge variant="destructive" className="text-[10px]">Missing Requirements</Badge>
        )}
      </div>

      {/* Pairing visualization */}
      <div className="flex items-center gap-4">
        {/* Head image */}
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Head Render</p>
          {pairing.headRender ? (
            <div className="relative">
              <img 
                src={pairing.headRender.url} 
                alt="Head render"
                className="w-20 h-20 object-cover rounded-lg border"
              />
              <Badge 
                variant={pairing.headRender.angleMatch === 'exact' ? 'default' : 
                         pairing.headRender.angleMatch === 'risk' ? 'destructive' : 'secondary'}
                className="absolute -bottom-1 -right-1 text-[9px] px-1"
              >
                {pairing.headRender.angleMatch === 'exact' ? 'Match' :
                 pairing.headRender.angleMatch === 'risk' ? 'Risk' : 'Reused'}
              </Badge>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
              <span className="text-[10px] text-muted-foreground text-center px-1">
                No head selected
              </span>
            </div>
          )}
          {pairing.headRender?.originalView && (
            <p className="text-[10px] text-muted-foreground">
              From: {VIEW_LABELS[pairing.headRender.originalView as ViewType] || pairing.headRender.originalView}
            </p>
          )}
        </div>

        {/* Arrow */}
        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        {/* Body image */}
        <div className="flex-1 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Body Image</p>
          {pairing.bodyImage ? (
            <div className="relative">
              <img 
                src={pairing.bodyImage.url} 
                alt="Body image"
                className="w-20 h-20 object-cover rounded-lg border"
              />
              <Badge 
                variant={pairing.bodyImage.source === 'exact' ? 'default' : 'secondary'}
                className="absolute -bottom-1 -right-1 text-[9px] px-1"
              >
                {pairing.bodyImage.source === 'exact' ? 'Exact' : 'Fallback'}
              </Badge>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-lg border border-dashed flex items-center justify-center bg-muted/50">
              <span className="text-[10px] text-muted-foreground text-center px-1">
                No body image
              </span>
            </div>
          )}
          {pairing.bodyImage?.fallbackFrom && (
            <p className="text-[10px] text-muted-foreground">
              From: {VIEW_LABELS[pairing.bodyImage.fallbackFrom as ViewType] || pairing.bodyImage.fallbackFrom}
            </p>
          )}
        </div>
      </div>

      {/* Warnings */}
      {pairing.warnings.length > 0 && (
        <div className="space-y-1">
          {pairing.warnings.map((warning, i) => (
            <div 
              key={i}
              className={cn(
                "flex items-center gap-2 text-xs px-2 py-1 rounded",
                "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              )}
            >
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Missing requirements */}
      {pairing.missingRequirements.length > 0 && (
        <div className="space-y-1">
          {pairing.missingRequirements.map((req, i) => (
            <div 
              key={i}
              className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-destructive/10 text-destructive"
            >
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{req}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
