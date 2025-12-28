import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { WorkflowNav, type WorkflowStep } from "@/components/layout/WorkflowNav";
import { ProjectSelector } from "@/components/ProjectSelector";
import { BrandRefsStep } from "@/components/steps/BrandRefsStep";
import { ExtractRecipesStep } from "@/components/steps/ExtractRecipesStep";
import { DigitalTalentStep } from "@/components/steps/DigitalTalentStep";
import { GenerateStep } from "@/components/steps/GenerateStep";
import { useProjects, useProjectData } from "@/hooks/useProject";
import type { Project } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RECIPE_EXTRACTION_SYSTEM_PROMPT, buildFullPrompt } from "@/lib/constants";

export default function Index() {
  const [showProjectSelector, setShowProjectSelector] = useState(true);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>(1);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { projects, createProject, deleteProject } = useProjects();
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
  } = useProjectData(currentProject?.id || null);

  // Show project selector on mount if no project selected
  useEffect(() => {
    if (!currentProject && projects.length === 0) {
      setShowProjectSelector(true);
    }
  }, [currentProject, projects.length]);

  const handleSelectProject = (project: Project) => {
    setCurrentProject(project);
    setShowProjectSelector(false);
    setCurrentStep(1);
  };

  const handleCreateProject = async (name: string, masterPrompt: string) => {
    const project = await createProject(name, masterPrompt);
    if (project) {
      handleSelectProject(project);
    }
  };

  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    if (currentProject?.id === id) {
      setCurrentProject(null);
      setShowProjectSelector(true);
    }
  };

  const handleExtractRecipes = async () => {
    if (!currentProject || brandRefs.length === 0) return;

    setIsExtracting(true);
    
    try {
      // Call edge function for AI analysis
      const { data, error } = await supabase.functions.invoke('analyze-expressions', {
        body: {
          imageUrls: brandRefs.map(r => r.image_url),
          systemPrompt: RECIPE_EXTRACTION_SYSTEM_PROMPT,
        },
      });

      if (error) {
        console.error('Extraction error:', error);
        toast.error('Failed to extract recipes');
        setIsExtracting(false);
        return;
      }

      if (data?.recipes && Array.isArray(data.recipes)) {
        const masterPrompt = currentProject.master_prompt || '';
        
        const newRecipes = data.recipes.map((r: any) => ({
          project_id: currentProject.id,
          name: r.name || 'Unnamed Recipe',
          recipe_json: {
            angle: r.angle || '',
            gaze: r.gaze || '',
            eyelids: r.eyelids || '',
            brows: r.brows || '',
            mouth: r.mouth || '',
            jaw: r.jaw || '',
            chin: r.chin || '',
            asymmetryNotes: r.asymmetryNotes || '',
            emotionLabel: r.emotionLabel || '',
            intensity: r.intensity || 0,
          },
          delta_line: r.deltaLine || '',
          full_prompt_text: buildFullPrompt(masterPrompt, r.deltaLine || ''),
        }));

        await addRecipes(newRecipes);
        setCurrentStep(2);
      } else {
        toast.error('No recipes found in response');
      }
    } catch (err) {
      console.error('Extraction error:', err);
      toast.error('Failed to extract recipes');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerate = async (payload: {
    modelIds: string[];
    recipeIds: string[];
    variations: number;
  }) => {
    if (!currentProject) return;
    
    setIsGenerating(true);
    
    try {
      // Build prompts array for the edge function
      const prompts: Array<{
        modelId: string;
        modelName: string;
        recipeId: string;
        recipeName: string;
        fullPrompt: string;
        modelRefUrl: string;
      }> = [];

      for (const modelId of payload.modelIds) {
        const model = digitalModels.find(m => m.id === modelId);
        const refs = modelRefs[modelId] || [];
        if (!model || refs.length === 0) continue;

        for (const recipeId of payload.recipeIds) {
          const recipe = recipes.find(r => r.id === recipeId);
          if (!recipe) continue;

          const fullPrompt = buildFullPrompt(masterPrompt, recipe.delta_line || '');

          // Create prompts for each variation
          for (let v = 0; v < payload.variations; v++) {
            prompts.push({
              modelId,
              modelName: model.name,
              recipeId,
              recipeName: recipe.name,
              fullPrompt,
              modelRefUrl: refs[0].image_url, // Use first ref as the base image
            });
          }
        }
      }

      if (prompts.length === 0) {
        toast.error('No valid prompts to generate. Make sure models have reference images.');
        setIsGenerating(false);
        return;
      }

      toast.info(`Starting generation of ${prompts.length} images...`);

      const { data, error } = await supabase.functions.invoke('generate-images', {
        body: {
          projectId: currentProject.id,
          prompts,
        },
      });

      if (error) {
        console.error('Generation error:', error);
        toast.error('Failed to start generation: ' + error.message);
        setIsGenerating(false);
        return;
      }

      if (data?.jobId) {
        toast.success(`Generation started! Job ID: ${data.jobId}`);
        // TODO: Poll job status for progress updates
      }
    } catch (err) {
      console.error('Generation error:', err);
      toast.error('Failed to start generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const masterPrompt = currentProject?.master_prompt || '';

  return (
    <div className="min-h-screen bg-background">
      <Header 
        projectName={currentProject?.name}
        onOpenProjects={() => setShowProjectSelector(true)}
      />

      <ProjectSelector
        projects={projects}
        isOpen={showProjectSelector}
        onClose={() => currentProject && setShowProjectSelector(false)}
        onSelect={handleSelectProject}
        onCreate={handleCreateProject}
        onDelete={handleDeleteProject}
      />

      {currentProject && (
        <>
          <WorkflowNav
            currentStep={currentStep}
            onStepClick={setCurrentStep}
            brandRefsCount={brandRefs.length}
            recipesCount={recipes.length}
            modelsCount={digitalModels.length}
          />

          <main className="container py-6 max-w-6xl">
            {currentStep === 1 && (
              <BrandRefsStep
                brandRefs={brandRefs}
                projectId={currentProject.id}
                onAddRefs={addBrandRefs}
                onRemoveRef={removeBrandRef}
                onClearAll={clearBrandRefs}
              />
            )}

            {currentStep === 2 && (
              <ExtractRecipesStep
                recipes={recipes}
                brandRefs={brandRefs}
                masterPrompt={masterPrompt}
                isExtracting={isExtracting}
                onExtract={handleExtractRecipes}
                onUpdateRecipe={updateRecipe}
              />
            )}

            {currentStep === 3 && (
              <DigitalTalentStep
                models={digitalModels}
                modelRefs={modelRefs}
                projectId={currentProject.id}
                onCreateModel={createModel}
                onDeleteModel={deleteModel}
                onRenameModel={renameModel}
                onAddRefs={addModelRefs}
                onRemoveRef={removeModelRef}
              />
            )}

            {currentStep === 4 && (
              <GenerateStep
                models={digitalModels}
                modelRefs={modelRefs}
                recipes={recipes}
                masterPrompt={masterPrompt}
                projectId={currentProject.id}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
