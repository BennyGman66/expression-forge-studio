import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, Copy, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFullPrompt } from "@/lib/constants";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ExpressionRecipe, BrandRef, RecipeJson } from "@/types";

interface RecipesPanelProps {
  recipes: ExpressionRecipe[];
  brandRefs: BrandRef[];
  masterPrompt: string;
  projectId: string;
  onUpdateRecipe: (id: string, updates: Partial<ExpressionRecipe>) => void;
  onAddRecipes: (recipes: Array<{
    project_id: string;
    name: string;
    recipe_json: RecipeJson;
    delta_line: string;
    full_prompt_text: string;
  }>) => Promise<void>;
}

export function RecipesPanel({ recipes, brandRefs, masterPrompt, projectId, onUpdateRecipe, onAddRecipes }: RecipesPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");

  const handleCopyPrompt = async (recipe: ExpressionRecipe) => {
    const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || "");
    await navigator.clipboard.writeText(fullPrompt);
    setCopiedId(recipe.id);
    toast.success("Prompt copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddRecipe = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) {
      toast.error("Please fill in both title and prompt");
      return;
    }

    const emptyRecipeJson: RecipeJson = {
      angle: "", gaze: "", eyelids: "", brows: "",
      mouth: "", jaw: "", chin: "", asymmetryNotes: "",
      emotionLabel: newTitle, intensity: 1,
    };

    await onAddRecipes([{
      project_id: projectId,
      name: newTitle.trim(),
      recipe_json: emptyRecipeJson,
      delta_line: newPrompt.trim(),
      full_prompt_text: buildFullPrompt(masterPrompt, newPrompt.trim()),
    }]);

    setNewTitle("");
    setNewPrompt("");
    setAddOpen(false);
  };

  if (recipes.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <p className="text-muted-foreground mb-4">
          No recipes yet. Add one manually or extract from brand references.
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add Recipe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Recipe</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Title</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Soft Confidence" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Prompt (delta line)</label>
                <Textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="Paste your expression prompt here..." rows={4} />
              </div>
              <Button onClick={handleAddRecipe} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Expression Recipes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-2" />Add Recipe</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Recipe</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Title</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Soft Confidence" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Prompt (delta line)</label>
                <Textarea value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} placeholder="Paste your expression prompt here..." rows={4} />
              </div>
              <Button onClick={handleAddRecipe} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {recipes.map((recipe) => {
          const isExpanded = expandedId === recipe.id;
          const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || "");

          return (
            <div
              key={recipe.id}
              className={cn("panel", isExpanded && "ring-1 ring-primary/30")}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
                className="w-full panel-header flex items-center justify-between text-left"
              >
                <div>
                  <h3 className="font-medium">{recipe.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {recipe.recipe_json?.emotionLabel} • Intensity {recipe.recipe_json?.intensity}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="panel-body space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Angle</label>
                      <Input
                        value={recipe.recipe_json?.angle || ""}
                        onChange={(e) =>
                          onUpdateRecipe(recipe.id, {
                            recipe_json: { ...recipe.recipe_json, angle: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Gaze</label>
                      <Input
                        value={recipe.recipe_json?.gaze || ""}
                        onChange={(e) =>
                          onUpdateRecipe(recipe.id, {
                            recipe_json: { ...recipe.recipe_json, gaze: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Mouth</label>
                      <Input
                        value={recipe.recipe_json?.mouth || ""}
                        onChange={(e) =>
                          onUpdateRecipe(recipe.id, {
                            recipe_json: { ...recipe.recipe_json, mouth: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Brows</label>
                      <Input
                        value={recipe.recipe_json?.brows || ""}
                        onChange={(e) =>
                          onUpdateRecipe(recipe.id, {
                            recipe_json: { ...recipe.recipe_json, brows: e.target.value },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Delta Line</label>
                    <Textarea
                      value={recipe.delta_line || ""}
                      onChange={(e) =>
                        onUpdateRecipe(recipe.id, { delta_line: e.target.value })
                      }
                      rows={2}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-muted-foreground">Full Prompt</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyPrompt(recipe)}
                      >
                        {copiedId === recipe.id ? (
                          <Check className="w-4 h-4 mr-1" />
                        ) : (
                          <Copy className="w-4 h-4 mr-1" />
                        )}
                        Copy
                      </Button>
                    </div>
                    <div className="p-3 rounded-md bg-secondary text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto scrollbar-thin">
                      {fullPrompt}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
