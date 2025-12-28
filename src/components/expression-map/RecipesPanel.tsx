import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFullPrompt } from "@/lib/constants";
import { toast } from "sonner";
import type { ExpressionRecipe, BrandRef } from "@/types";

interface RecipesPanelProps {
  recipes: ExpressionRecipe[];
  brandRefs: BrandRef[];
  masterPrompt: string;
  onUpdateRecipe: (id: string, updates: Partial<ExpressionRecipe>) => void;
}

export function RecipesPanel({ recipes, brandRefs, masterPrompt, onUpdateRecipe }: RecipesPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPrompt = async (recipe: ExpressionRecipe) => {
    const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || "");
    await navigator.clipboard.writeText(fullPrompt);
    setCopiedId(recipe.id);
    toast.success("Prompt copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (recipes.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in">
        <p className="text-muted-foreground">
          No recipes extracted yet. Upload brand reference images and click "Extract Recipes".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-serif">Expression Recipes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""} extracted from your brand references
        </p>
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
