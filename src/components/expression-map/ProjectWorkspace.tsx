import { useState, useEffect } from "react";
import { HubHeader } from "@/components/layout/HubHeader";
import { WorkflowTabs, type WorkflowStep } from "@/components/expression-map/WorkflowTabs";
import { BrandRefsPanel } from "@/components/expression-map/BrandRefsPanel";
import { RecipesPanel } from "@/components/expression-map/RecipesPanel";
import { TalentPanel } from "@/components/expression-map/TalentPanel";
import { GeneratePanel } from "@/components/expression-map/GeneratePanel";
import { ReviewPanel } from "@/components/expression-map/ReviewPanel";
import { useProjectData } from "@/hooks/useProject";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT, buildFullPrompt } from "@/lib/constants";
import type { Project } from "@/types";

interface ProjectWorkspaceProps {
  project: Project;
  onBack: () => void;
  onDelete: () => void;
}

export function ProjectWorkspace({ project, onBack, onDelete }: ProjectWorkspaceProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("brand-refs");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputsCount, setOutputsCount] = useState(0);

  const {
    brandRefs,
    digitalModels,
    modelRefs,
    recipes,
    addBrandRefs,
    removeBrandRef,
    clearBrandRefs,
    createModel,
    deleteModel,
    renameModel,
    addModelRefs,
    removeModelRef,
    addRecipes,
    updateRecipe,
  } = useProjectData(project.id);

  const masterPrompt = project.master_prompt || "";

  // Fetch outputs count
  useEffect(() => {
    const fetchOutputsCount = async () => {
      const { count } = await supabase
        .from("outputs")
        .select("*", { count: "exact", head: true })
        .eq("project_id", project.id)
        .eq("status", "completed")
        .not("image_url", "is", null);
      
      setOutputsCount(count || 0);
    };

    fetchOutputsCount();

    // Subscribe to new outputs
    const channel = supabase
      .channel("workspace-outputs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outputs",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          fetchOutputsCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [project.id]);
  const handleExtractRecipes = async () => {
    if (brandRefs.length === 0) return;

    setIsExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-expressions", {
        body: {
          imageUrls: brandRefs.map((r) => r.image_url),
          systemPrompt: RECIPE_EXTRACTION_SYSTEM_PROMPT,
        },
      });

      if (error) {
        console.error("Extraction error:", error);
        toast.error("Failed to extract recipes");
        setIsExtracting(false);
        return;
      }

      if (data?.recipes && Array.isArray(data.recipes)) {
        const newRecipes = data.recipes.map((r: any) => ({
          project_id: project.id,
          name: r.name || "Unnamed Recipe",
          recipe_json: {
            angle: r.angle || "",
            gaze: r.gaze || "",
            eyelids: r.eyelids || "",
            brows: r.brows || "",
            mouth: r.mouth || "",
            jaw: r.jaw || "",
            chin: r.chin || "",
            asymmetryNotes: r.asymmetryNotes || "",
            emotionLabel: r.emotionLabel || "",
            intensity: r.intensity || 0,
          },
          delta_line: r.deltaLine || "",
          full_prompt_text: buildFullPrompt(masterPrompt, r.deltaLine || ""),
        }));

        await addRecipes(newRecipes);
        setCurrentStep("recipes");
        toast.success(`Extracted ${newRecipes.length} recipes`);
      } else {
        toast.error("No recipes found in response");
      }
    } catch (err) {
      console.error("Extraction error:", err);
      toast.error("Failed to extract recipes");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerate = async (payload: {
    modelIds: string[];
    recipeIds: string[];
    variations: number;
  }) => {
    setIsGenerating(true);

    try {
      // Fetch existing completed outputs to avoid regenerating
      const { data: existingOutputs } = await supabase
        .from("outputs")
        .select("digital_model_id, recipe_id")
        .eq("project_id", project.id)
        .eq("status", "completed")
        .not("image_url", "is", null);

      // Count existing outputs per model+recipe combo
      const existingCounts: Record<string, number> = {};
      if (existingOutputs) {
        for (const output of existingOutputs) {
          const key = `${output.digital_model_id}-${output.recipe_id}`;
          existingCounts[key] = (existingCounts[key] || 0) + 1;
        }
      }

      const prompts: Array<{
        modelId: string;
        modelName: string;
        recipeId: string;
        recipeName: string;
        fullPrompt: string;
        modelRefUrl: string;
      }> = [];

      let skippedCount = 0;

      for (const modelId of payload.modelIds) {
        const model = digitalModels.find((m) => m.id === modelId);
        const refs = modelRefs[modelId] || [];
        if (!model || refs.length === 0) continue;

        for (const recipeId of payload.recipeIds) {
          const recipe = recipes.find((r) => r.id === recipeId);
          if (!recipe) continue;

          const key = `${modelId}-${recipeId}`;
          const existingCount = existingCounts[key] || 0;
          const neededVariations = Math.max(0, payload.variations - existingCount);
          skippedCount += existingCount;

          const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || "");

          for (let v = 0; v < neededVariations; v++) {
            prompts.push({
              modelId,
              modelName: model.name,
              recipeId,
              recipeName: recipe.name,
              fullPrompt,
              modelRefUrl: refs[0].image_url,
            });
          }
        }
      }

      if (prompts.length === 0 && skippedCount > 0) {
        toast.success(`All ${skippedCount} images already generated!`);
        setIsGenerating(false);
        return;
      }

      if (prompts.length === 0) {
        toast.error("No valid prompts to generate. Make sure models have reference images.");
        setIsGenerating(false);
        return;
      }

      if (skippedCount > 0) {
        toast.info(`Skipping ${skippedCount} already generated, creating ${prompts.length} new images...`);
      } else {
        toast.info(`Starting generation of ${prompts.length} images...`);
      }

      const { data, error } = await supabase.functions.invoke("generate-images", {
        body: {
          projectId: project.id,
          prompts,
        },
      });

      if (error) {
        console.error("Generation error:", error);
        toast.error("Failed to start generation: " + error.message);
        setIsGenerating(false);
        return;
      }

      if (data?.jobId) {
        toast.success(`Generation started! Job ID: ${data.jobId}`);
      }
    } catch (err) {
      console.error("Generation error:", err);
      toast.error("Failed to start generation");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Expression Map" currentProject={project.name} />

      <div className="border-b border-border bg-card px-6 py-3">
        <WorkflowTabs
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          brandRefsCount={brandRefs.length}
          recipesCount={recipes.length}
          modelsCount={digitalModels.length}
          outputsCount={outputsCount}
        />
      </div>

      <main className="p-6">
        {currentStep === "brand-refs" && (
          <BrandRefsPanel
            brandRefs={brandRefs}
            projectId={project.id}
            onAddRefs={addBrandRefs}
            onRemoveRef={removeBrandRef}
            onClearAll={clearBrandRefs}
            onExtract={handleExtractRecipes}
            isExtracting={isExtracting}
          />
        )}

        {currentStep === "recipes" && (
          <RecipesPanel
            recipes={recipes}
            brandRefs={brandRefs}
            masterPrompt={masterPrompt}
            onUpdateRecipe={updateRecipe}
          />
        )}

        {currentStep === "talent" && (
          <TalentPanel
            models={digitalModels}
            modelRefs={modelRefs}
            projectId={project.id}
            onCreateModel={createModel}
            onDeleteModel={deleteModel}
            onRenameModel={renameModel}
            onAddRefs={addModelRefs}
            onRemoveRef={removeModelRef}
          />
        )}

        {currentStep === "generate" && (
          <GeneratePanel
            models={digitalModels}
            modelRefs={modelRefs}
            recipes={recipes}
            masterPrompt={masterPrompt}
            projectId={project.id}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        )}

        {currentStep === "review" && (
          <ReviewPanel
            projectId={project.id}
            models={digitalModels}
            modelRefs={modelRefs}
          />
        )}
      </main>
    </div>
  );
}
