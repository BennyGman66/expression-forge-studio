import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { VIEW_LABELS } from "@/types/face-application";

interface GeneratedOutput {
  id: string;
  stored_url: string;
  view: string;
  attempt_index: number;
  status: string;
  look_id: string;
}

interface GeneratedImagesGalleryProps {
  outputs: GeneratedOutput[];
  isGenerating: boolean;
  onRegenerateView: (view: string) => void;
}

export function GeneratedImagesGallery({
  outputs,
  isGenerating,
  onRegenerateView,
}: GeneratedImagesGalleryProps) {
  // Group by view
  const groupedByView = outputs.reduce((acc, output) => {
    const viewKey = output.view || 'unknown';
    if (!acc[viewKey]) acc[viewKey] = [];
    acc[viewKey].push(output);
    return acc;
  }, {} as Record<string, GeneratedOutput[]>);

  return (
    <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Generated Images</h4>
        <span className="text-xs text-muted-foreground">{outputs.length} images</span>
      </div>
      
      <div className="space-y-4">
        {Object.entries(groupedByView).map(([view, viewOutputs]) => (
          <div key={view} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {VIEW_LABELS[view] || view} ({viewOutputs.length})
              </p>
              {!isGenerating && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onRegenerateView(view)}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Regenerate {VIEW_LABELS[view] || view}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {viewOutputs.map((output) => (
                <div key={output.id} className="relative group">
                  <img
                    src={output.stored_url}
                    alt={`${view} attempt ${output.attempt_index + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border transition-transform hover:scale-105"
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/60 text-white rounded-b-lg py-0.5">
                    #{output.attempt_index + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
