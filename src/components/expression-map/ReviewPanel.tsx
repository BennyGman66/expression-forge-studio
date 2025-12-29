import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Check, Download, Lock, RefreshCw, ChevronDown, ChevronUp, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DigitalModel, DigitalModelRef, ExpressionRecipe } from "@/types";

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
  recipes: ExpressionRecipe[];
  masterPrompt: string;
  onRedoGenerate: (payload: {
    modelId: string;
    recipeVariations: Array<{ recipeId: string; variations: number }>;
    aiModel: string;
  }) => Promise<void>;
}

const GRID_TARGET_OPTIONS = [5, 10, 15, 16, 20, 25, 30, 35, 40, 45, 50];

export function ReviewPanel({ 
  projectId, 
  models, 
  modelRefs, 
  recipes, 
  masterPrompt, 
  onRedoGenerate 
}: ReviewPanelProps) {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const [lockedInOutputIds, setLockedInOutputIds] = useState<Set<string>>(new Set());
  const [missingRecipeVariations, setMissingRecipeVariations] = useState<Record<string, number>>({});
  const [isRedoing, setIsRedoing] = useState(false);
  const [showMissingSection, setShowMissingSection] = useState(false);
  const [targetGridSize, setTargetGridSize] = useState(20);
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

  // Fetch locked-in output IDs from expression_map_exports
  useEffect(() => {
    const fetchLockedInOutputs = async () => {
      const { data } = await supabase
        .from("expression_map_exports")
        .select("output_ids")
        .eq("project_id", projectId);

      if (data) {
        const allLockedIds = new Set<string>();
        for (const row of data) {
          const ids = row.output_ids as string[] | null;
          if (ids) {
            for (const id of ids) {
              allLockedIds.add(id);
            }
          }
        }
        setLockedInOutputIds(allLockedIds);
      }
    };

    fetchLockedInOutputs();

    // Subscribe to exports changes
    const channel = supabase
      .channel("review-exports")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expression_map_exports",
          filter: `project_id=eq.${projectId}`,
        },
        () => fetchLockedInOutputs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Get coverage info for a model
  const getRecipeCoverage = useMemo(() => {
    return (modelId: string) => {
      const modelOutputs = outputs.filter((o) => o.digital_model_id === modelId);
      const coveredRecipeIds = new Set<string>();
      
      for (const output of modelOutputs) {
        if (output.recipe_id && lockedInOutputIds.has(output.id)) {
          coveredRecipeIds.add(output.recipe_id);
        }
      }

      // Get all recipes that have outputs for this model
      const recipesWithOutputs = new Set<string>();
      for (const output of modelOutputs) {
        if (output.recipe_id) {
          recipesWithOutputs.add(output.recipe_id);
        }
      }

      const covered = Array.from(coveredRecipeIds);
      const missing = recipes
        .filter((r) => recipesWithOutputs.has(r.id) && !coveredRecipeIds.has(r.id))
        .map((r) => r.id);

      return { covered, missing, total: recipesWithOutputs.size };
    };
  }, [outputs, lockedInOutputIds, recipes]);

  // Initialize missing recipe variations when selecting a model
  useEffect(() => {
    if (selectedModelId) {
      const { missing } = getRecipeCoverage(selectedModelId);
      const initial: Record<string, number> = {};
      for (const recipeId of missing) {
        initial[recipeId] = missingRecipeVariations[recipeId] ?? 2;
      }
      setMissingRecipeVariations(initial);
    }
  }, [selectedModelId, getRecipeCoverage]);

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

    ctx.fillStyle = '#e8e6e1';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

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

  const handleLockIn = async () => {
    const favoriteOutputs = outputs.filter((o) => favorites.has(o.id));
    if (favoriteOutputs.length === 0) return;

    const imageUrls = favoriteOutputs.map((o) => o.image_url).filter(Boolean);
    const outputIds = favoriteOutputs.map((o) => o.id);
    const name = `Expression Map ${new Date().toLocaleDateString()}`;

    const { error } = await supabase.from("expression_map_exports").insert({
      project_id: projectId,
      name,
      image_urls: imageUrls,
      output_ids: outputIds,
    });

    if (error) {
      console.error("Lock in failed:", error);
      toast.error("Failed to save expression map");
    } else {
      toast.success("Expression map locked in!");
      setFavorites(new Set());
      setShowExport(false);
    }
  };

  const handleVariationChange = (recipeId: string, value: number) => {
    const clamped = Math.min(20, Math.max(1, value));
    setMissingRecipeVariations((prev) => ({ ...prev, [recipeId]: clamped }));
  };

  const setAllVariations = (value: number) => {
    setMissingRecipeVariations((prev) => {
      const next: Record<string, number> = {};
      for (const key of Object.keys(prev)) {
        next[key] = value;
      }
      return next;
    });
  };

  const handleRedoMissing = async () => {
    if (!selectedModelId) return;
    
    const recipeVariations = Object.entries(missingRecipeVariations)
      .filter(([_, count]) => count > 0)
      .map(([recipeId, variations]) => ({ recipeId, variations }));

    if (recipeVariations.length === 0) {
      toast.error("No recipes selected for regeneration");
      return;
    }

    setIsRedoing(true);
    try {
      await onRedoGenerate({
        modelId: selectedModelId,
        recipeVariations,
        aiModel: "gemini-2.5-flash",
      });
      setShowMissingSection(false);
    } finally {
      setIsRedoing(false);
    }
  };

  const totalRedoCount = Object.values(missingRecipeVariations).reduce((a, b) => a + b, 0);

  const selectedModel = models.find((m) => m.id === selectedModelId);
  const modelOutputs = selectedModelId ? getModelOutputs(selectedModelId) : [];
  const favoriteOutputs = outputs.filter((o) => favorites.has(o.id));
  const coverage = selectedModelId ? getRecipeCoverage(selectedModelId) : null;
  const missingRecipes = coverage ? recipes.filter((r) => coverage.missing.includes(r.id)) : [];

  // Check if an output's recipe is covered
  const isRecipeCovered = (recipeId: string | null) => {
    if (!recipeId || !coverage) return false;
    return coverage.covered.includes(recipeId);
  };

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadGrid}>
              <Download className="w-4 h-4 mr-2" />
              Download PNG
            </Button>
            <Button onClick={handleLockIn}>
              <Lock className="w-4 h-4 mr-2" />
              Lock In
            </Button>
          </div>
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
            {/* Target grid selector */}
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-4 h-4 text-muted-foreground" />
              <Select
                value={targetGridSize.toString()}
                onValueChange={(v) => setTargetGridSize(parseInt(v))}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRID_TARGET_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Progress toward target */}
            <div className={cn(
              "text-sm font-medium px-3 py-1 rounded-full",
              favorites.size === targetGridSize 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : favorites.size > targetGridSize
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-muted text-muted-foreground"
            )}>
              {favorites.size} / {targetGridSize}
            </div>
            <Button onClick={handleExport} disabled={favorites.size === 0}>
              Proceed
            </Button>
          </div>
        </div>

        {/* Coverage summary and redo missing section */}
        {coverage && coverage.total > 0 && (
          <div className="border border-border rounded-lg bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">
                    {coverage.covered.length} of {coverage.total} recipes covered
                  </span>
                </div>
                {coverage.missing.length > 0 && (
                  <span className="text-sm text-orange-500">
                    ({coverage.missing.length} missing)
                  </span>
                )}
              </div>
              {coverage.missing.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMissingSection(!showMissingSection)}
                >
                  Redo Missing
                  {showMissingSection ? (
                    <ChevronUp className="w-4 h-4 ml-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-1" />
                  )}
                </Button>
              )}
            </div>

            {showMissingSection && missingRecipes.length > 0 && (
              <div className="border-t border-border pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Set how many variations to generate for each uncovered recipe (1-20)
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAllVariations(2)}>
                      All 2
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setAllVariations(5)}>
                      All 5
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setAllVariations(10)}>
                      All 10
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                  {missingRecipes.map((recipe) => (
                    <div
                      key={recipe.id}
                      className="flex items-center justify-between gap-3 p-3 border border-border rounded-md bg-background"
                    >
                      <span className="text-sm font-medium truncate flex-1">
                        {recipe.name}
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={missingRecipeVariations[recipe.id] ?? 2}
                        onChange={(e) =>
                          handleVariationChange(recipe.id, parseInt(e.target.value) || 1)
                        }
                        className="w-16 h-8 text-center"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleRedoMissing}
                    disabled={isRedoing || totalRedoCount === 0}
                  >
                    {isRedoing ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Redo Missing ({totalRedoCount} total)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {modelOutputs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No expressions generated for this model yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {modelOutputs.map((output) => {
              const recipeCovered = isRecipeCovered(output.recipe_id);
              return (
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
                  {/* Coverage indicator */}
                  <div
                    className={cn(
                      "absolute top-2 left-2 w-2.5 h-2.5 rounded-full",
                      recipeCovered ? "bg-green-500" : "bg-orange-400"
                    )}
                    title={recipeCovered ? "Recipe covered" : "Recipe not covered"}
                  />
                  {favorites.has(output.id) && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
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
            const modelCoverage = getRecipeCoverage(model.id);

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
                  <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                    <span>{outputCount} expressions</span>
                    {modelCoverage.total > 0 && (
                      <span className={cn(
                        modelCoverage.missing.length > 0 ? "text-orange-500" : "text-green-600"
                      )}>
                        {modelCoverage.covered.length}/{modelCoverage.total} covered
                      </span>
                    )}
                    {modelFavorites > 0 && (
                      <span className="text-primary">{modelFavorites} selected</span>
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
