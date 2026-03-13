import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { WorkflowTabs, type WorkflowStep } from "@/components/expression-map/WorkflowTabs";
import { BrandRefsPanel } from "@/components/expression-map/BrandRefsPanel";
import { RecipesPanel } from "@/components/expression-map/RecipesPanel";
import { TalentPanel } from "@/components/expression-map/TalentPanel";
import { GeneratePanel } from "@/components/expression-map/GeneratePanel";
import { ReviewPanel } from "@/components/expression-map/ReviewPanel";
import { ExpressionMapsReviewTab } from "@/components/expression-map/ExpressionMapsReviewTab";
import { useProjectData } from "@/hooks/useProject";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT, buildFullPrompt } from "@/lib/constants";
import { useExpressionQueueWorkers } from "@/hooks/useExpressionQueueWorkers";
import type { Project } from "@/types";

const VALID_STEPS: WorkflowStep[] = ["brand-refs", "recipes", "talent", "generate", "review", "expression-maps"];

interface ProjectWorkspaceProps {
  project: Project;
  onBack: () => void;
  onDelete: () => void;
}

export function ProjectWorkspace({ project, onBack, onDelete }: ProjectWorkspaceProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const stepFromUrl = searchParams.get("step") as WorkflowStep;
  const currentStep = VALID_STEPS.includes(stepFromUrl) ? stepFromUrl : "brand-refs";
  
  const handleStepChange = (step: WorkflowStep) => {
    setSearchParams({ step });
  };

  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [outputsCount, setOutputsCount] = useState(0);
  const [exportsCount, setExportsCount] = useState(0);

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
    refetch,
  } = useProjectData(project.id);

  const masterPrompt = project.master_prompt || "";

  // Fetch outputs and exports count
  useEffect(() => {
    const fetchCounts = async () => {
      const [outputsResult, exportsResult] = await Promise.all([
        supabase
          .from("outputs")
          .select("*", { count: "exact", head: true })
          .eq("project_id", project.id)
          .eq("status", "completed")
          .not("image_url", "is", null),
        supabase
          .from("expression_map_exports")
          .select("*", { count: "exact", head: true })
          .eq("project_id", project.id),
      ]);

      setOutputsCount(outputsResult.count || 0);
      setExportsCount(exportsResult.count || 0);
    };

    fetchCounts();

    // Subscribe to outputs
    const outputsChannel = supabase
      .channel("workspace-outputs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outputs",
          filter: `project_id=eq.${project.id}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    // Subscribe to exports
    const exportsChannel = supabase
      .channel("workspace-exports")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expression_map_exports",
          filter: `project_id=eq.${project.id}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(outputsChannel);
      supabase.removeChannel(exportsChannel);
    };
  }, [project.id]);
  const handleExtractRecipes = async (model: string) => {
    if (brandRefs.length === 0) return;

    setIsExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-expressions", {
        body: {
          imageUrls: brandRefs.map((r) => r.image_url),
          customPrompt: RECIPE_EXTRACTION_SYSTEM_PROMPT,
          projectId: project.id,
          model,
        },
      });

      if (error) {
        console.error("Extraction error:", error);
        toast.error("Failed to extract recipes");
        setIsExtracting(false);
        return;
      }

      // Now using background processing - recipes will be saved directly to DB
      toast.success("Analyzing expressions in background. Recipes will appear shortly.");
      handleStepChange("recipes");
      
      // Poll for new recipes a few times
      const pollForRecipes = async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        await refetch();
        await new Promise(resolve => setTimeout(resolve, 15000));
        await refetch();
        await new Promise(resolve => setTimeout(resolve, 20000));
        await refetch();
      };
      pollForRecipes();
      
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
    aiModel: string;
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

      await processGenerationPrompts(prompts, payload.aiModel);

    } catch (err) {
      console.error("Generation error:", err);
      toast.error("Failed to start generation");
    } finally {
      setIsGenerating(false);
    }
  };

  // Redo generate for specific model + recipe combinations
  const handleRedoGenerate = async (payload: {
    modelId: string;
    recipeVariations: Array<{ recipeId: string; variations: number }>;
    aiModel: string;
  }) => {
    const model = digitalModels.find((m) => m.id === payload.modelId);
    const refs = modelRefs[payload.modelId] || [];
    
    if (!model || refs.length === 0) {
      toast.error("Model not found or has no reference images");
      return;
    }

    const prompts: Array<{
      modelId: string;
      modelName: string;
      recipeId: string;
      recipeName: string;
      fullPrompt: string;
      modelRefUrl: string;
    }> = [];

    for (const { recipeId, variations } of payload.recipeVariations) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) continue;

      const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || "");

      for (let v = 0; v < variations; v++) {
        prompts.push({
          modelId: payload.modelId,
          modelName: model.name,
          recipeId,
          recipeName: recipe.name,
          fullPrompt,
          modelRefUrl: refs[0].image_url,
        });
      }
    }

    if (prompts.length === 0) {
      toast.error("No valid prompts to generate");
      return;
    }

    toast.info(`Generating ${prompts.length} new expressions...`);
    await processGenerationPrompts(prompts, payload.aiModel);
  };

  // Shared generation logic — bulk-insert into expression_render_queue
  const processGenerationPrompts = async (
    prompts: Array<{
      modelId: string;
      modelName: string;
      recipeId: string;
      recipeName: string;
      fullPrompt: string;
      modelRefUrl: string;
    }>,
    aiModel: string
  ) => {
    // Step 1: Create the job record (reuse existing edge function)
    const { data: jobData, error: jobError } = await supabase.functions.invoke("generate-images", {
      body: {
        action: "create-job",
        projectId: project.id,
        total: prompts.length,
        aiModel,
      },
    });

    if (jobError || !jobData?.jobId) {
      console.error("Failed to create job:", jobError);
      toast.error("Failed to start generation");
      return;
    }

    const jobId = jobData.jobId;
    setActiveJobId(jobId);

    // Step 2: Bulk-insert all prompts into the render queue
    const queueItems = prompts.map((p) => ({
      job_id: jobId,
      project_id: project.id,
      digital_model_id: p.modelId,
      recipe_id: p.recipeId,
      prompt: p.fullPrompt,
      model_ref_url: p.modelRefUrl,
      ai_model: aiModel,
    }));

    const { error: insertError } = await (supabase as any)
      .from("expression_render_queue")
      .insert(queueItems);

    if (insertError) {
      console.error("Failed to enqueue items:", insertError);
      toast.error("Failed to enqueue generation items");
      return;
    }

    toast.success(`Queued ${prompts.length} images for server-side generation!`);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Expression Map" currentProject={project.name} />

      <div className="border-b border-border bg-card px-6 py-3">
        <WorkflowTabs
          currentStep={currentStep}
          onStepChange={handleStepChange}
          brandRefsCount={brandRefs.length}
          recipesCount={recipes.length}
          modelsCount={digitalModels.length}
          outputsCount={outputsCount}
          exportsCount={exportsCount}
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
            activeJobId={activeJobId}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />
        )}

        {currentStep === "review" && (
          <ReviewPanel
            projectId={project.id}
            models={digitalModels}
            modelRefs={modelRefs}
            recipes={recipes}
            masterPrompt={masterPrompt}
            onRedoGenerate={handleRedoGenerate}
          />
        )}

        {currentStep === "expression-maps" && (
          <ExpressionMapsReviewTab 
            projectId={project.id} 
            onAddMore={() => handleStepChange("review")}
          />
        )}
      </main>
    </div>
  );
}
