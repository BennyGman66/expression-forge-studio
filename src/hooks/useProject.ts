import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { 
  Project, 
  BrandRef, 
  DigitalModel, 
  DigitalModelRef, 
  ExpressionRecipe,
  RecipeJson 
} from '@/types';
import { toast } from 'sonner';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching projects:', error);
      toast.error('Failed to load projects');
    } else {
      setProjects(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (name: string, masterPrompt: string) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, master_prompt: masterPrompt })
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to create project');
      return null;
    }
    
    setProjects(prev => [data, ...prev]);
    toast.success('Project created');
    return data;
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete project');
      return;
    }
    
    setProjects(prev => prev.filter(p => p.id !== id));
    toast.success('Project deleted');
  };

  return { projects, loading, createProject, deleteProject, refetch: fetchProjects };
}

export function useProjectData(projectId: string | null) {
  const [brandRefs, setBrandRefs] = useState<BrandRef[]>([]);
  const [digitalModels, setDigitalModels] = useState<DigitalModel[]>([]);
  const [modelRefs, setModelRefs] = useState<Record<string, DigitalModelRef[]>>({});
  const [recipes, setRecipes] = useState<ExpressionRecipe[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    
    setLoading(true);
    
    // Fetch brand refs
    const { data: refs } = await supabase
      .from('brand_refs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');
    
    const typedRefs: BrandRef[] = (refs || []).map(r => ({
      ...r,
      metadata_json: (r.metadata_json || {}) as Record<string, unknown>
    }));
    setBrandRefs(typedRefs);

    // Fetch digital models
    const { data: models } = await supabase
      .from('digital_models')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');
    setDigitalModels(models || []);

    // Fetch all model refs
    if (models && models.length > 0) {
      const { data: allRefs } = await supabase
        .from('digital_model_refs')
        .select('*')
        .in('digital_model_id', models.map(m => m.id))
        .order('created_at');
      
      const grouped: Record<string, DigitalModelRef[]> = {};
      (allRefs || []).forEach(ref => {
        if (!grouped[ref.digital_model_id]) grouped[ref.digital_model_id] = [];
        grouped[ref.digital_model_id].push(ref);
      });
      setModelRefs(grouped);
    }

    // Fetch recipes
    const { data: recipeData } = await supabase
      .from('expression_recipes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');
    
    const typedRecipes: ExpressionRecipe[] = (recipeData || []).map(r => ({
      ...r,
      recipe_json: (r.recipe_json || {}) as unknown as RecipeJson
    }));
    setRecipes(typedRecipes);

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Brand refs
  const addBrandRefs = async (urls: { url: string; fileName: string }[]) => {
    if (!projectId) return;
    
    const toInsert = urls.map(({ url, fileName }) => ({
      project_id: projectId,
      image_url: url,
      file_name: fileName,
    }));
    
    const { data, error } = await supabase
      .from('brand_refs')
      .insert(toInsert)
      .select();
    
    if (error) {
      toast.error('Failed to save references');
      return;
    }
    
    const typedData: BrandRef[] = (data || []).map(r => ({
      ...r,
      metadata_json: (r.metadata_json || {}) as Record<string, unknown>
    }));
    setBrandRefs(prev => [...prev, ...typedData]);
  };

  const removeBrandRef = async (id: string) => {
    const { error } = await supabase.from('brand_refs').delete().eq('id', id);
    if (error) {
      toast.error('Failed to remove reference');
      return;
    }
    setBrandRefs(prev => prev.filter(r => r.id !== id));
  };

  const clearBrandRefs = async () => {
    if (!projectId) return;
    const { error } = await supabase.from('brand_refs').delete().eq('project_id', projectId);
    if (error) {
      toast.error('Failed to clear references');
      return;
    }
    setBrandRefs([]);
    toast.success('All references cleared');
  };

  // Digital models
  const createModel = async (name: string) => {
    if (!projectId) return;
    
    const { data, error } = await supabase
      .from('digital_models')
      .insert({ project_id: projectId, name })
      .select()
      .single();
    
    if (error) {
      toast.error('Failed to create model');
      return;
    }
    
    setDigitalModels(prev => [...prev, data]);
    toast.success('Model created');
  };

  const deleteModel = async (id: string) => {
    const { error } = await supabase.from('digital_models').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete model');
      return;
    }
    setDigitalModels(prev => prev.filter(m => m.id !== id));
    setModelRefs(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast.success('Model deleted');
  };

  const renameModel = async (id: string, name: string) => {
    const { error } = await supabase.from('digital_models').update({ name }).eq('id', id);
    if (error) {
      toast.error('Failed to rename model');
      return;
    }
    setDigitalModels(prev => prev.map(m => m.id === id ? { ...m, name } : m));
  };

  const addModelRefs = async (modelId: string, urls: { url: string; fileName: string }[]) => {
    const toInsert = urls.map(({ url, fileName }) => ({
      digital_model_id: modelId,
      image_url: url,
      file_name: fileName,
    }));
    
    const { data, error } = await supabase
      .from('digital_model_refs')
      .insert(toInsert)
      .select();
    
    if (error) {
      toast.error('Failed to save references');
      return;
    }
    
    setModelRefs(prev => ({
      ...prev,
      [modelId]: [...(prev[modelId] || []), ...(data || [])],
    }));
  };

  const removeModelRef = async (refId: string) => {
    const { error } = await supabase.from('digital_model_refs').delete().eq('id', refId);
    if (error) {
      toast.error('Failed to remove reference');
      return;
    }
    setModelRefs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[key] = next[key].filter(r => r.id !== refId);
      });
      return next;
    });
  };

  // Recipes
  const addRecipes = async (newRecipes: Array<{
    project_id: string;
    name: string;
    recipe_json: RecipeJson;
    delta_line: string;
    full_prompt_text: string;
  }>) => {
    if (!projectId) return;
    
    // Cast to any to bypass strict Json type checking
    const insertData = newRecipes.map(r => ({
      project_id: r.project_id,
      name: r.name,
      delta_line: r.delta_line,
      full_prompt_text: r.full_prompt_text,
      recipe_json: JSON.parse(JSON.stringify(r.recipe_json)),
    }));
    
    const { data, error } = await supabase
      .from('expression_recipes')
      .insert(insertData)
      .select();
    
    if (error) {
      console.error('Error saving recipes:', error);
      toast.error('Failed to save recipes');
      return;
    }
    
    const typedRecipes: ExpressionRecipe[] = (data || []).map(r => ({
      ...r,
      recipe_json: (r.recipe_json || {}) as unknown as RecipeJson
    }));
    setRecipes(prev => [...prev, ...typedRecipes]);
    toast.success(`${typedRecipes.length} recipes extracted`);
  };

  const updateRecipe = async (id: string, updates: Partial<ExpressionRecipe>) => {
    const dbUpdates: Record<string, unknown> = { ...updates };
    if (updates.recipe_json) {
      dbUpdates.recipe_json = updates.recipe_json as unknown as Record<string, unknown>;
    }
    
    const { error } = await supabase
      .from('expression_recipes')
      .update(dbUpdates)
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to update recipe');
      return;
    }
    
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, ...updates } as ExpressionRecipe : r));
    toast.success('Recipe updated');
  };

  return {
    brandRefs,
    digitalModels,
    modelRefs,
    recipes,
    loading,
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
    refetch: fetchData,
  };
}
