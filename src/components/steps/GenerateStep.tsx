import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Download, 
  Copy, 
  FileJson, 
  FileSpreadsheet,
  Check,
  Loader2,
  Grid3X3
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DigitalModel, ExpressionRecipe, DigitalModelRef } from "@/types";
import { buildFullPrompt } from "@/lib/constants";
import { toast } from "sonner";

interface GenerateStepProps {
  models: DigitalModel[];
  modelRefs: Record<string, DigitalModelRef[]>;
  recipes: ExpressionRecipe[];
  masterPrompt: string;
  onGenerate: (payload: {
    modelIds: string[];
    recipeIds: string[];
    variations: number;
  }) => void;
  isGenerating: boolean;
}

export function GenerateStep({
  models,
  modelRefs,
  recipes,
  masterPrompt,
  onGenerate,
  isGenerating,
}: GenerateStepProps) {
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());
  const [variations, setVariations] = useState(1);
  const [copied, setCopied] = useState(false);

  const toggleModel = (id: string) => {
    const next = new Set(selectedModels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedModels(next);
  };

  const toggleRecipe = (id: string) => {
    const next = new Set(selectedRecipes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRecipes(next);
  };

  const selectAllModels = () => {
    if (selectedModels.size === models.length) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(models.map(m => m.id)));
    }
  };

  const selectAllRecipes = () => {
    if (selectedRecipes.size === recipes.length) {
      setSelectedRecipes(new Set());
    } else {
      setSelectedRecipes(new Set(recipes.map(r => r.id)));
    }
  };

  const totalPrompts = selectedModels.size * selectedRecipes.size * variations;

  const generatePrompts = () => {
    const prompts: Array<{
      modelId: string;
      modelName: string;
      recipeId: string;
      recipeName: string;
      variation: number;
      prompt: string;
    }> = [];

    selectedModels.forEach(modelId => {
      const model = models.find(m => m.id === modelId);
      if (!model) return;

      selectedRecipes.forEach(recipeId => {
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return;

        for (let v = 1; v <= variations; v++) {
          prompts.push({
            modelId,
            modelName: model.name,
            recipeId,
            recipeName: recipe.name,
            variation: v,
            prompt: buildFullPrompt(masterPrompt, recipe.delta_line || ''),
          });
        }
      });
    });

    return prompts;
  };

  const handleCopyAll = async () => {
    const prompts = generatePrompts();
    const text = prompts.map((p, i) => 
      `=== Prompt ${i + 1}: ${p.modelName} + ${p.recipeName} (v${p.variation}) ===\n${p.prompt}`
    ).join('\n\n');
    
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`Copied ${prompts.length} prompts`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJSON = () => {
    const prompts = generatePrompts();
    const manifest = {
      generated_at: new Date().toISOString(),
      total_prompts: prompts.length,
      variations_per_recipe: variations,
      prompts: prompts.map(p => ({
        model: { id: p.modelId, name: p.modelName },
        recipe: { id: p.recipeId, name: p.recipeName },
        variation: p.variation,
        prompt: p.prompt,
      })),
    };
    
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expression-prompts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded JSON manifest');
  };

  const handleDownloadCSV = () => {
    const prompts = generatePrompts();
    const headers = ['Model ID', 'Model Name', 'Recipe ID', 'Recipe Name', 'Variation', 'Prompt'];
    const rows = prompts.map(p => [
      p.modelId,
      p.modelName,
      p.recipeId,
      p.recipeName,
      p.variation,
      `"${p.prompt.replace(/"/g, '""')}"`,
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expression-prompts-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded CSV');
  };

  const canGenerate = selectedModels.size > 0 && selectedRecipes.size > 0;

  return (
    <div className="workflow-step animate-fade-in">
      <div className="workflow-step-header">
        <div className="step-indicator active">
          <Play className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Generate Expression Maps</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select models and recipes to generate Nano Banana-ready prompts
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Models Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Digital Models</h3>
            <Button variant="ghost" size="sm" onClick={selectAllModels}>
              {selectedModels.size === models.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
              No digital models created yet
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              {models.map((model) => {
                const refs = modelRefs[model.id] || [];
                return (
                  <label
                    key={model.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedModels.has(model.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Checkbox
                      checked={selectedModels.has(model.id)}
                      onCheckedChange={() => toggleModel(model.id)}
                    />
                    <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                      {refs.length > 0 ? (
                        <img src={refs[0].image_url} alt={model.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{model.name}</p>
                      <p className="text-xs text-muted-foreground">{refs.length} refs</p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Recipes Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Expression Recipes</h3>
            <Button variant="ghost" size="sm" onClick={selectAllRecipes}>
              {selectedRecipes.size === recipes.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          
          {recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded-lg">
              No recipes extracted yet
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
              {recipes.map((recipe) => (
                <label
                  key={recipe.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                    selectedRecipes.has(recipe.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Checkbox
                    checked={selectedRecipes.has(recipe.id)}
                    onCheckedChange={() => toggleRecipe(recipe.id)}
                  />
                  <div>
                    <p className="font-medium">{recipe.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {recipe.recipe_json.emotionLabel} • Intensity {recipe.recipe_json.intensity}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Variations Slider */}
      <div className="mt-6 p-4 rounded-lg bg-muted/30 border border-border">
        <div className="flex items-center justify-between mb-3">
          <Label>Variations per recipe</Label>
          <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{variations}</span>
        </div>
        <Slider
          value={[variations]}
          onValueChange={([v]) => setVariations(v)}
          min={1}
          max={5}
          step={1}
          className="w-full"
        />
      </div>

      {/* Summary & Actions */}
      <div className="mt-6 p-4 rounded-lg bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">Total prompts to generate:</p>
            <p className="text-2xl font-bold text-gradient">{totalPrompts}</p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleCopyAll}
              disabled={!canGenerate}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copy All
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadJSON}
              disabled={!canGenerate}
            >
              <FileJson className="w-4 h-4" />
              JSON
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadCSV}
              disabled={!canGenerate}
            >
              <FileSpreadsheet className="w-4 h-4" />
              CSV
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            variant="glow" 
            size="lg"
            className="flex-1"
            disabled={!canGenerate || isGenerating}
            onClick={() => onGenerate({
              modelIds: Array.from(selectedModels),
              recipeIds: Array.from(selectedRecipes),
              variations,
            })}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Generate with Nano Banana
              </>
            )}
          </Button>
          <Button variant="outline" size="lg" disabled={!canGenerate}>
            <Grid3X3 className="w-5 h-5" />
            Preview Grid
          </Button>
        </div>
      </div>
    </div>
  );
}
