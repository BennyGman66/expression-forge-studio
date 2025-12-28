import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { Trash2, Image as ImageIcon } from "lucide-react";
import type { BrandRef } from "@/types";

interface BrandRefsStepProps {
  brandRefs: BrandRef[];
  onAddRefs: (urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (id: string) => void;
  onClearAll: () => void;
  projectId: string;
}

export function BrandRefsStep({ 
  brandRefs, 
  onAddRefs, 
  onRemoveRef, 
  onClearAll,
  projectId 
}: BrandRefsStepProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = brandRefs.find(ref => ref.id === selectedId);

  return (
    <div className="workflow-step animate-fade-in">
      <div className="workflow-step-header">
        <div className="step-indicator active">
          <ImageIcon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Brand Reference Images</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload 10–15+ reference images from your brand photography to extract expression recipes
          </p>
        </div>
        {brandRefs.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearAll}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        )}
      </div>

      <ImageUploader 
        onUpload={onAddRefs} 
        folder={`projects/${projectId}/brand-refs`}
        className="mb-6"
      />

      {brandRefs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {brandRefs.length} image{brandRefs.length !== 1 ? 's' : ''} uploaded
            </h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
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

      {selectedRef && (
        <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border">
          <div className="flex gap-4">
            <img 
              src={selectedRef.image_url} 
              alt={selectedRef.file_name || "Selected"} 
              className="w-32 h-32 object-cover rounded-lg"
            />
            <div>
              <h4 className="font-medium">{selectedRef.file_name || 'Image'}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Extract Recipes" to analyze this and other images
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
