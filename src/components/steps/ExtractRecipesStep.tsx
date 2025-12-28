import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Wand2, 
  Loader2, 
  Copy, 
  Check, 
  ChevronRight,
  Edit3,
  Save,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpressionRecipe, BrandRef } from "@/types";
import { buildFullPrompt } from "@/lib/constants";
import { toast } from "sonner";

interface ExtractRecipesStepProps {
  recipes: ExpressionRecipe[];
  brandRefs: BrandRef[];
  masterPrompt: string;
  isExtracting: boolean;
  onExtract: () => void;
  onUpdateRecipe: (id: string, updates: Partial<ExpressionRecipe>) => void;
}

export function ExtractRecipesStep({ 
  recipes, 
  brandRefs,
  masterPrompt,
  isExtracting,
  onExtract,
  onUpdateRecipe
}: ExtractRecipesStepProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const intensityColors = {
    0: 'bg-muted text-muted-foreground',
    1: 'bg-primary/20 text-primary',
    2: 'bg-warning/20 text-warning',
    3: 'bg-destructive/20 text-destructive',
  };

  return (
    <div className="workflow-step animate-fade-in">
      <div className="workflow-step-header">
        <div className="step-indicator active">
          <Wand2 className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Expression Recipes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            AI-extracted expression recipes from your brand references
          </p>
        </div>
        <Button 
          variant="glow" 
          onClick={onExtract}
          disabled={isExtracting || brandRefs.length === 0}
        >
          {isExtracting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Extract Recipes
            </>
          )}
        </Button>
      </div>

      {brandRefs.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          <p>Upload brand reference images first to extract expression recipes</p>
        </div>
      )}

      {brandRefs.length > 0 && recipes.length === 0 && !isExtracting && (
        <div className="p-8 text-center border border-dashed border-border rounded-lg">
          <Wand2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Click "Extract Recipes" to analyze {brandRefs.length} brand reference{brandRefs.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {recipes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recipe List */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              {recipes.length} recipes extracted
            </h3>
            {recipes.map((recipe) => (
              <div
                key={recipe.id}
                className={cn(
                  "recipe-card flex items-center gap-3",
                  selectedRecipeId === recipe.id && "selected"
                )}
                onClick={() => setSelectedRecipeId(recipe.id)}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  intensityColors[recipe.recipe_json.intensity as keyof typeof intensityColors] || intensityColors[1]
                )}>
                  {recipe.recipe_json.intensity}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{recipe.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {recipe.recipe_json.emotionLabel}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            ))}
          </div>

          {/* Recipe Detail */}
          <div className="border border-border rounded-lg p-4 bg-muted/20">
            {selectedRecipe ? (
              <RecipeDetail 
                recipe={selectedRecipe}
                masterPrompt={masterPrompt}
                isEditing={editingId === selectedRecipe.id}
                onEdit={() => setEditingId(selectedRecipe.id)}
                onSave={(updates) => {
                  onUpdateRecipe(selectedRecipe.id, updates);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
                onCopy={(text) => handleCopy(text, selectedRecipe.id)}
                copied={copiedId === selectedRecipe.id}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Select a recipe to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface RecipeDetailProps {
  recipe: ExpressionRecipe;
  masterPrompt: string;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<ExpressionRecipe>) => void;
  onCancel: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
}

function RecipeDetail({ 
  recipe, 
  masterPrompt, 
  isEditing, 
  onEdit, 
  onSave, 
  onCancel,
  onCopy,
  copied
}: RecipeDetailProps) {
  const [editedRecipe, setEditedRecipe] = useState(recipe);

  const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || '');

  const fields = [
    { key: 'angle', label: 'Head Angle' },
    { key: 'gaze', label: 'Gaze' },
    { key: 'eyelids', label: 'Eyelids' },
    { key: 'brows', label: 'Brows' },
    { key: 'mouth', label: 'Mouth' },
    { key: 'jaw', label: 'Jaw' },
    { key: 'chin', label: 'Chin' },
    { key: 'asymmetryNotes', label: 'Asymmetry' },
    { key: 'emotionLabel', label: 'Emotion' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{recipe.name}</h3>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={onCancel}>
                <X className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => onSave(editedRecipe)}>
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Edit3 className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <span className="text-muted-foreground">{label}:</span>
            {isEditing ? (
              <Input
                value={editedRecipe.recipe_json[key] || ''}
                onChange={(e) => setEditedRecipe({
                  ...editedRecipe,
                  recipe_json: { ...editedRecipe.recipe_json, [key]: e.target.value }
                })}
                className="mt-1 h-8 text-sm"
              />
            ) : (
              <p className="font-medium">{recipe.recipe_json[key] || '—'}</p>
            )}
          </div>
        ))}
        <div>
          <span className="text-muted-foreground">Intensity:</span>
          <p className="font-medium">{recipe.recipe_json.intensity}/3</p>
        </div>
      </div>

      <div>
        <span className="text-sm text-muted-foreground">Delta Line:</span>
        {isEditing ? (
          <Textarea
            value={editedRecipe.delta_line || ''}
            onChange={(e) => setEditedRecipe({ ...editedRecipe, delta_line: e.target.value })}
            className="mt-1 text-sm font-mono"
            rows={2}
          />
        ) : (
          <p className="mt-1 text-sm font-mono bg-muted/50 p-2 rounded">
            {recipe.delta_line || 'No delta line'}
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Full Prompt:</span>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => onCopy(fullPrompt)}
          >
            {copied ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        </div>
        <div className="prompt-display text-xs max-h-40 overflow-y-auto scrollbar-thin">
          {fullPrompt}
        </div>
      </div>
    </div>
  );
}
