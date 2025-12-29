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
    refetch,
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
      setCurrentStep("recipes");
      
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

      // Step 1: Create the job first
      const { data: jobData, error: jobError } = await supabase.functions.invoke("generate-images", {
        body: {
          action: "create-job",
          projectId: project.id,
          total: prompts.length,
          aiModel: payload.aiModel,
        },
      });

      if (jobError || !jobData?.jobId) {
        console.error("Failed to create job:", jobError);
        toast.error("Failed to start generation");
        setIsGenerating(false);
        return;
      }

      const jobId = jobData.jobId;
      toast.success(`Generation started! Processing ${prompts.length} images...`);

      // Step 2: Process prompts one at a time from the frontend
      // This runs in the background - we don't await the whole loop
      (async () => {
        const MAX_RETRIES = 3;
        const BASE_DELAY = 1000; // 1 second

        for (let i = 0; i < prompts.length; i++) {
          let retryCount = 0;
          let success = false;

          while (retryCount <= MAX_RETRIES && !success) {
            try {
              const response = await supabase.functions.invoke("generate-images", {
                body: {
                  projectId: project.id,
                  jobId,
                  promptIndex: i,
                  prompt: prompts[i],
                  total: prompts.length,
                  aiModel: payload.aiModel,
                },
              });

              if (response.error) {
                console.error(`Error on prompt ${i} (attempt ${retryCount + 1}):`, response.error);
                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                  const delay = BASE_DELAY * Math.pow(2, retryCount - 1); // 1s, 2s, 4s
                  console.log(`Retrying in ${delay}ms...`);
                  await new Promise(r => setTimeout(r, delay));
                  continue;
                }
                break; // Max retries exceeded, move to next prompt
              }

              const result = response.data;

              // Handle rate limiting with exponential backoff
              if (result?.rateLimited) {
                retryCount++;
                const delay = result.retryAfter || BASE_DELAY * Math.pow(2, retryCount);
                console.log(`Rate limited, waiting ${delay}ms (attempt ${retryCount})...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
              }

              // Handle stop/credits exhausted - break out entirely
              if (result?.stopped || result?.creditsExhausted) {
                console.log("Generation stopped or credits exhausted");
                return; // Exit the entire loop
              }

              // Handle other failures with retry
              if (result?.success === false && !result?.skipped) {
                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                  const delay = BASE_DELAY * Math.pow(2, retryCount - 1);
                  console.log(`Generation failed, retrying in ${delay}ms (attempt ${retryCount})...`);
                  await new Promise(r => setTimeout(r, delay));
                  continue;
                }
                console.error(`Failed after ${MAX_RETRIES} retries, moving on`);
                break;
              }

              // Success!
              success = true;

              // Small delay between successful requests
              if (i < prompts.length - 1) {
                await new Promise(r => setTimeout(r, 500));
              }
            } catch (err) {
              console.error(`Error processing prompt ${i} (attempt ${retryCount + 1}):`, err);
              retryCount++;
              if (retryCount <= MAX_RETRIES) {
                const delay = BASE_DELAY * Math.pow(2, retryCount - 1);
                console.log(`Exception caught, retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
              }
            }
          }
        }

        // Mark job as completed
        await supabase
          .from("jobs")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("status", "running"); // Only update if still running
      })();

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
