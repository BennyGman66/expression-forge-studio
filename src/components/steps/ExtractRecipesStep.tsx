import { useState } from "react";
import { Button, Flex, Text, Heading, TextField, TextArea, Card, Box, Badge, IconButton } from "@radix-ui/themes";
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

  return (
    <Card className="animate-fade-in" size="3">
      <Flex align="center" gap="4" mb="4">
        <div className="step-indicator active">
          <Wand2 className="w-4 h-4" />
        </div>
        <Box className="flex-1">
          <Heading size="5">Expression Recipes</Heading>
          <Text size="2" color="gray" className="mt-1">
            AI-extracted expression recipes from your brand references
          </Text>
        </Box>
        <Button 
          onClick={onExtract}
          disabled={isExtracting || brandRefs.length === 0}
          className="glow-border"
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
      </Flex>

      {brandRefs.length === 0 && (
        <Flex justify="center" py="8">
          <Text color="gray">Upload brand reference images first to extract expression recipes</Text>
        </Flex>
      )}

      {brandRefs.length > 0 && recipes.length === 0 && !isExtracting && (
        <Flex 
          direction="column" 
          align="center" 
          justify="center" 
          py="8" 
          className="border border-dashed border-border rounded-lg"
        >
          <Wand2 className="w-12 h-12 mb-4 text-muted-foreground" />
          <Text color="gray">
            Click "Extract Recipes" to analyze {brandRefs.length} brand reference{brandRefs.length !== 1 ? 's' : ''}
          </Text>
        </Flex>
      )}

      {recipes.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recipe List */}
          <Flex direction="column" gap="2" className="max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            <Text size="2" color="gray" mb="2">
              <Badge color="lime" variant="soft" mr="2">{recipes.length}</Badge>
              recipes extracted
            </Text>
            {recipes.map((recipe) => (
              <Card
                key={recipe.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  selectedRecipeId === recipe.id && "border-primary bg-primary/5"
                )}
                onClick={() => setSelectedRecipeId(recipe.id)}
              >
                <Flex align="center" gap="3" p="3">
                  <Badge 
                    size="2" 
                    color={recipe.recipe_json.intensity >= 2 ? "orange" : "lime"}
                    variant="soft"
                    radius="full"
                  >
                    {recipe.recipe_json.intensity}
                  </Badge>
                  <Box className="flex-1 min-w-0">
                    <Text weight="medium" className="block truncate">{recipe.name}</Text>
                    <Text size="1" color="gray" className="truncate">
                      {recipe.recipe_json.emotionLabel}
                    </Text>
                  </Box>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Flex>
              </Card>
            ))}
          </Flex>

          {/* Recipe Detail */}
          <Card variant="surface" className="p-4">
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
              <Flex align="center" justify="center" className="h-full min-h-[200px]">
                <Text color="gray">Select a recipe to view details</Text>
              </Flex>
            )}
          </Card>
        </div>
      )}
    </Card>
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
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between">
        <Heading size="4">{recipe.name}</Heading>
        <Flex gap="2">
          {isEditing ? (
            <>
              <IconButton variant="ghost" onClick={onCancel}>
                <X className="w-4 h-4" />
              </IconButton>
              <Button size="2" onClick={() => onSave(editedRecipe)}>
                <Save className="w-4 h-4" />
                Save
              </Button>
            </>
          ) : (
            <Button size="2" variant="soft" onClick={onEdit}>
              <Edit3 className="w-4 h-4" />
              Edit
            </Button>
          )}
        </Flex>
      </Flex>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {fields.map(({ key, label }) => (
          <Box key={key}>
            <Text size="1" color="gray">{label}:</Text>
            {isEditing ? (
              <TextField.Root
                value={editedRecipe.recipe_json[key] || ''}
                onChange={(e) => setEditedRecipe({
                  ...editedRecipe,
                  recipe_json: { ...editedRecipe.recipe_json, [key]: e.target.value }
                })}
                size="1"
                className="mt-1"
              />
            ) : (
              <Text weight="medium" className="block">{recipe.recipe_json[key] || '—'}</Text>
            )}
          </Box>
        ))}
        <Box>
          <Text size="1" color="gray">Intensity:</Text>
          <Text weight="medium">{recipe.recipe_json.intensity}/3</Text>
        </Box>
      </div>

      <Box>
        <Text size="1" color="gray">Delta Line:</Text>
        {isEditing ? (
          <TextArea
            value={editedRecipe.delta_line || ''}
            onChange={(e) => setEditedRecipe({ ...editedRecipe, delta_line: e.target.value })}
            className="mt-1 text-sm font-mono"
            rows={2}
          />
        ) : (
          <Box className="mt-1 text-sm font-mono bg-muted/50 p-2 rounded">
            {recipe.delta_line || 'No delta line'}
          </Box>
        )}
      </Box>

      <Box>
        <Flex align="center" justify="between" mb="2">
          <Text size="1" color="gray">Full Prompt:</Text>
          <IconButton 
            variant="ghost" 
            size="1"
            onClick={() => onCopy(fullPrompt)}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </IconButton>
        </Flex>
        <Box className="prompt-display text-xs max-h-40 overflow-y-auto scrollbar-thin">
          {fullPrompt}
        </Box>
      </Box>
    </Flex>
  );
}
