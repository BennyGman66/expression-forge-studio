import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Download, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DigitalModel, DigitalModelRef } from "@/types";

interface Output {
  id: string;
  image_url: string | null;
  status: string;
  digital_model_id: string | null;
  recipe_id: string | null;
  prompt_used: string | null;
}

interface ReviewPanelProps {
  projectId: string;
  models: DigitalModel[];
  modelRefs: Record<string, DigitalModelRef[]>;
}

export function ReviewPanel({ projectId, models, modelRefs }: ReviewPanelProps) {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Fetch outputs for this project
  useEffect(() => {
    const fetchOutputs = async () => {
      const { data } = await supabase
        .from("outputs")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .not("image_url", "is", null)
        .order("created_at", { ascending: false });

      if (data) setOutputs(data);
    };

    fetchOutputs();

    // Subscribe to new outputs
    const channel = supabase
      .channel("review-outputs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "outputs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newOutput = payload.new as Output;
          if (newOutput.status === "completed" && newOutput.image_url) {
            setOutputs((prev) => [newOutput, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getModelOutputs = (modelId: string) => {
    return outputs.filter((o) => o.digital_model_id === modelId);
  };

  const getModelThumbnail = (modelId: string) => {
    const refs = modelRefs[modelId] || [];
    return refs.length > 0 ? refs[0].image_url : null;
  };

  const handleExport = async () => {
    if (favorites.size === 0) {
      toast.error("Please select at least one expression");
      return;
    }
    setShowExport(true);
  };

  const handleDownloadGrid = async () => {
    const favoriteOutputs = outputs.filter((o) => favorites.has(o.id));
    if (favoriteOutputs.length === 0) return;

    const cols = 5;
    const cellSize = 400;
    const gap = 8;
    const rows = Math.ceil(favoriteOutputs.length / cols);
    const canvasWidth = cols * cellSize + (cols - 1) * gap;
    const canvasHeight = rows * cellSize + (rows - 1) * gap;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill background
    ctx.fillStyle = '#e8e6e1';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Load and draw images
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    };

    toast.info('Generating PNG...');

    try {
      for (let i = 0; i < favoriteOutputs.length; i++) {
        const output = favoriteOutputs[i];
        if (!output.image_url) continue;
        
        const img = await loadImage(output.image_url);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cellSize + gap);
        const y = row * (cellSize + gap);
        
        // Draw image covering the cell (object-cover equivalent)
        const scale = Math.max(cellSize / img.width, cellSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (cellSize - scaledWidth) / 2;
        const offsetY = (cellSize - scaledHeight) / 2;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellSize, cellSize);
        ctx.clip();
        ctx.drawImage(img, x + offsetX, y + offsetY, scaledWidth, scaledHeight);
        ctx.restore();
      }

      // Download
      const link = document.createElement('a');
      link.download = `expression-grid-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Grid exported!');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export grid');
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelOutputs = selectedModelId ? getModelOutputs(selectedModelId) : [];
  const favoriteOutputs = outputs.filter((o) => favorites.has(o.id));

  // Export grid view
  if (showExport) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setShowExport(false)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-serif">Export Grid</h2>
              <p className="text-sm text-muted-foreground">
                {favoriteOutputs.length} expressions selected
              </p>
            </div>
          </div>
          <Button onClick={handleDownloadGrid}>
            <Download className="w-4 h-4 mr-2" />
            Download Grid
          </Button>
        </div>

        <div 
          ref={exportRef}
          className="grid grid-cols-5 gap-2 p-4"
          style={{ backgroundColor: '#e8e6e1' }}
        >
          {favoriteOutputs.map((output) => (
            <div key={output.id} className="aspect-square overflow-hidden">
              <img
                src={output.image_url!}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Expression viewer for selected model
  if (selectedModel) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedModelId(null)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-serif">{selectedModel.name}</h2>
              <p className="text-sm text-muted-foreground">
                {modelOutputs.length} expressions generated
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="font-medium text-primary">{favorites.size}</span>
              <span className="text-muted-foreground"> selected</span>
            </div>
            <Button onClick={handleExport} disabled={favorites.size === 0}>
              Proceed
            </Button>
          </div>
        </div>

        {modelOutputs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No expressions generated for this model yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {modelOutputs.map((output) => (
              <div
                key={output.id}
                onClick={() => toggleFavorite(output.id)}
                className={cn(
                  "aspect-square rounded-lg overflow-hidden cursor-pointer relative transition-all hover:scale-[1.02]",
                  favorites.has(output.id) 
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background" 
                    : "hover:ring-1 hover:ring-border"
                )}
              >
                <img
                  src={output.image_url!}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {favorites.has(output.id) && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Model selection grid
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Review Expressions</h2>
          <p className="text-sm text-muted-foreground">
            Select a model to review and pick your favorite expressions
          </p>
        </div>
        {favorites.size > 0 && (
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="font-medium text-primary">{favorites.size}</span>
              <span className="text-muted-foreground"> expressions selected</span>
            </div>
            <Button onClick={handleExport}>
              Proceed to Export
            </Button>
          </div>
        )}
      </div>

      {models.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>No digital models created yet</p>
          <p className="text-sm">Create models in the Digital Talent tab first</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {models.map((model) => {
            const thumbnail = getModelThumbnail(model.id);
            const outputCount = getModelOutputs(model.id).length;
            const modelFavorites = getModelOutputs(model.id).filter((o) => favorites.has(o.id)).length;

            return (
              <div
                key={model.id}
                onClick={() => setSelectedModelId(model.id)}
                className="group cursor-pointer"
              >
                <div className="aspect-square rounded-lg overflow-hidden bg-muted border border-border group-hover:border-primary/50 transition-all">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={model.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      No image
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <h3 className="font-medium">{model.name}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{outputCount} expressions</span>
                    {modelFavorites > 0 && (
                      <span className="text-primary">• {modelFavorites} selected</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
