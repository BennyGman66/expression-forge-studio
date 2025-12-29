import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Wand2, Loader2 } from "lucide-react";
import type { BrandRef } from "@/types";

const AI_MODELS = [
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Best quality, slower" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast, good quality" },
  { id: "openai/gpt-5", name: "GPT-5", description: "Excellent reasoning" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", description: "Balanced speed/quality" },
];

interface BrandRefsPanelProps {
  brandRefs: BrandRef[];
  projectId: string;
  onAddRefs: (urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (id: string) => void;
  onClearAll: () => void;
  onExtract: (model: string) => void;
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
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-pro");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Brand Reference Images</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload 10–15+ reference images from your brand photography to extract expression recipes
          </p>
        </div>
        <div className="flex items-center gap-3">
          {brandRefs.length > 0 && (
            <>
              <Button variant="outline" onClick={onClearAll}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
              
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">AI Model:</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[180px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    {AI_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <div className="flex flex-col">
                          <span>{model.name}</span>
                          <span className="text-xs text-muted-foreground">{model.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Button onClick={() => onExtract(selectedModel)} disabled={isExtracting}>
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
