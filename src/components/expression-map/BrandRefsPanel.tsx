import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { Trash2, Wand2, Loader2 } from "lucide-react";
import type { BrandRef } from "@/types";

interface BrandRefsPanelProps {
  brandRefs: BrandRef[];
  projectId: string;
  onAddRefs: (urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (id: string) => void;
  onClearAll: () => void;
  onExtract: () => void;
  isExtracting: boolean;
}

export function BrandRefsPanel({
  brandRefs,
  projectId,
  onAddRefs,
  onRemoveRef,
  onClearAll,
  onExtract,
  isExtracting,
}: BrandRefsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Brand Reference Images</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload 10–15+ reference images from your brand photography to extract expression recipes
          </p>
        </div>
        <div className="flex gap-2">
          {brandRefs.length > 0 && (
            <>
              <Button variant="outline" onClick={onClearAll}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
              <Button onClick={onExtract} disabled={isExtracting}>
                {isExtracting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Extract Recipes
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <ImageUploader
        onUpload={onAddRefs}
        folder={`projects/${projectId}/brand-refs`}
      />

      {brandRefs.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            {brandRefs.length} image{brandRefs.length !== 1 ? "s" : ""} uploaded
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {brandRefs.map((ref) => (
              <ImageThumbnail
                key={ref.id}
                src={ref.image_url}
                alt={ref.file_name || undefined}
                selected={ref.id === selectedId}
                onClick={() => setSelectedId(ref.id === selectedId ? null : ref.id)}
                onRemove={() => onRemoveRef(ref.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
