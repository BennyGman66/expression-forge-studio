import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  WorkflowLook, 
  WorkflowLookWithDetails, 
  WorkflowImage,
  WorkflowOutput,
  WorkflowStage,
  FilterMode,
  WORKFLOW_STAGES,
} from '@/types/optimised-workflow';
import { useToast } from '@/hooks/use-toast';

// Helper to determine if a look needs action based on its stage
function checkNeedsAction(look: WorkflowLook, images: WorkflowImage[], outputs: WorkflowOutput[]): boolean {
  if (look.stage === 'DONE') return false;
  
  switch (look.stage) {
    case 'LOOKS_UPLOADED':
      return !look.digital_talent_id;
    case 'MODEL_PAIRED':
      return images.some(img => !img.head_cropped_url);
    case 'HEADS_CROPPED':
      return images.some(img => !img.matched_face_url);
    case 'FACE_MATCHED':
      return !outputs.some(o => o.status === 'completed');
    case 'GENERATED':
      // Needs 3 selections per view
      const selectionsByView = outputs.reduce((acc, o) => {
        if (o.is_selected) {
          acc[o.view] = (acc[o.view] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      return images.some(img => (selectionsByView[img.view] || 0) < 3);
    case 'REVIEW_SELECTED':
      return true; // Ready to send
    case 'JOB_BOARD':
      return true; // Awaiting external action
    default:
      return true;
  }
}

// Helper to identify issues with a look
function identifyIssues(look: WorkflowLook, images: WorkflowImage[], outputs: WorkflowOutput[]): string[] {
  const issues: string[] = [];
  
  // Check for missing views
  const requiredViews = ['full_front', 'back'];
  const existingViews = new Set(images.map(img => img.view));
  requiredViews.forEach(view => {
    if (!existingViews.has(view)) {
      issues.push(`Missing ${view.replace('_', ' ')}`);
    }
  });

  // Check for incomplete crops
  if (look.stage === 'MODEL_PAIRED' || look.stage === 'HEADS_CROPPED') {
    const uncroppedCount = images.filter(img => !img.head_cropped_url).length;
    if (uncroppedCount > 0) {
      issues.push(`${uncroppedCount} uncropped`);
    }
  }

  // Check for unmatched faces
  if (look.stage === 'HEADS_CROPPED' || look.stage === 'FACE_MATCHED') {
    const unmatchedCount = images.filter(img => !img.matched_face_url).length;
    if (unmatchedCount > 0) {
      issues.push(`${unmatchedCount} unmatched`);
    }
  }

  // Check for pending generations
  if (look.stage === 'GENERATED') {
    const selectionsByView = outputs.reduce((acc, o) => {
      if (o.is_selected) {
        acc[o.view] = (acc[o.view] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    images.forEach(img => {
      const count = selectionsByView[img.view] || 0;
      if (count < 3) {
        issues.push(`Needs ${3 - count} more for ${img.view}`);
      }
    });
  }

  return issues;
}

export function useWorkflowLooks(projectId: string | null, filterMode: FilterMode = 'all') {
  return useQuery({
    queryKey: ['workflow-looks', projectId, filterMode],
    queryFn: async (): Promise<WorkflowLookWithDetails[]> => {
      if (!projectId) return [];

      // Fetch looks
      const { data: looks, error: looksError } = await supabase
        .from('workflow_looks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (looksError) throw looksError;
      if (!looks || looks.length === 0) return [];

      const lookIds = looks.map(l => l.id);

      // Fetch images for all looks
      const { data: images, error: imagesError } = await supabase
        .from('workflow_images')
        .select('*')
        .in('look_id', lookIds);

      if (imagesError) throw imagesError;

      // Fetch outputs for all looks
      const { data: outputs, error: outputsError } = await supabase
        .from('workflow_outputs')
        .select('*')
        .in('look_id', lookIds);

      if (outputsError) throw outputsError;

      // Fetch digital talents
      const talentIds = [...new Set(looks.filter(l => l.digital_talent_id).map(l => l.digital_talent_id))];
      let talents: Record<string, { id: string; name: string; thumbnail_url: string | null }> = {};
      
      if (talentIds.length > 0) {
        const { data: talentData } = await supabase
          .from('digital_talents')
          .select('id, name')
          .in('id', talentIds);
        
        if (talentData) {
          talents = talentData.reduce((acc, t) => {
            acc[t.id] = { ...t, thumbnail_url: null };
            return acc;
          }, {} as typeof talents);
        }
      }

      // Combine data
      const looksWithDetails: WorkflowLookWithDetails[] = looks.map(look => {
        const lookImages = (images || []).filter(img => img.look_id === look.id) as WorkflowImage[];
        const lookOutputs = (outputs || []).filter(o => o.look_id === look.id) as WorkflowOutput[];
        const digital_talent = look.digital_talent_id ? talents[look.digital_talent_id] || null : null;
        const issues = identifyIssues(look as WorkflowLook, lookImages, lookOutputs);
        const needsAction = checkNeedsAction(look as WorkflowLook, lookImages, lookOutputs);

        return {
          ...look,
          stage: look.stage as WorkflowStage,
          images: lookImages,
          outputs: lookOutputs,
          digital_talent,
          issues,
          needsAction,
        };
      });

      // Apply filter
      if (filterMode === 'needs_action') {
        return looksWithDetails.filter(l => l.needsAction && l.stage !== 'DONE');
      }

      return looksWithDetails;
    },
    enabled: !!projectId,
  });
}

export function useWorkflowLook(lookId: string | null) {
  return useQuery({
    queryKey: ['workflow-look', lookId],
    queryFn: async (): Promise<WorkflowLookWithDetails | null> => {
      if (!lookId) return null;

      const { data: look, error: lookError } = await supabase
        .from('workflow_looks')
        .select('*')
        .eq('id', lookId)
        .single();

      if (lookError) throw lookError;
      if (!look) return null;

      // Fetch images
      const { data: images } = await supabase
        .from('workflow_images')
        .select('*')
        .eq('look_id', lookId);

      // Fetch outputs
      const { data: outputs } = await supabase
        .from('workflow_outputs')
        .select('*')
        .eq('look_id', lookId);

      // Fetch digital talent
      let digital_talent: { id: string; name: string; thumbnail_url: string | null } | null = null;
      if (look.digital_talent_id) {
        const { data: talentData } = await supabase
          .from('digital_talents')
          .select('id, name')
          .eq('id', look.digital_talent_id)
          .single();
        if (talentData) {
          digital_talent = { ...talentData, thumbnail_url: null };
        }
      }

      const lookImages = (images || []) as WorkflowImage[];
      const lookOutputs = (outputs || []) as WorkflowOutput[];
      const issues = identifyIssues(look as WorkflowLook, lookImages, lookOutputs);
      const needsAction = checkNeedsAction(look as WorkflowLook, lookImages, lookOutputs);

      return {
        ...look,
        stage: look.stage as WorkflowStage,
        images: lookImages,
        outputs: lookOutputs,
        digital_talent,
        issues,
        needsAction,
      };
    },
    enabled: !!lookId,
  });
}

export function useUpdateLookStage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ lookId, stage }: { lookId: string; stage: WorkflowStage }) => {
      const { data, error } = await supabase
        .from('workflow_looks')
        .update({ 
          stage, 
          stage_updated_at: new Date().toISOString() 
        })
        .eq('id', lookId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-looks'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-look', data.id] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project'] });
    },
    onError: (error) => {
      toast({
        title: 'Error updating stage',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useBulkUpdateLookStage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ lookIds, stage }: { lookIds: string[]; stage: WorkflowStage }) => {
      const { data, error } = await supabase
        .from('workflow_looks')
        .update({ 
          stage, 
          stage_updated_at: new Date().toISOString() 
        })
        .in('id', lookIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-looks'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project'] });
      toast({
        title: 'Stages updated',
        description: 'All selected looks have been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error updating stages',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useAssignDigitalTalent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ lookIds, digitalTalentId }: { lookIds: string[]; digitalTalentId: string }) => {
      const { data, error } = await supabase
        .from('workflow_looks')
        .update({ digital_talent_id: digitalTalentId })
        .in('id', lookIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-looks'] });
      toast({
        title: 'Model assigned',
        description: 'Digital talent has been assigned to selected looks.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error assigning model',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteWorkflowLook() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (lookId: string) => {
      const { error } = await supabase
        .from('workflow_looks')
        .delete()
        .eq('id', lookId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-looks'] });
      queryClient.invalidateQueries({ queryKey: ['workflow-project'] });
      toast({
        title: 'Look deleted',
        description: 'The look and all its images have been deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error deleting look',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
