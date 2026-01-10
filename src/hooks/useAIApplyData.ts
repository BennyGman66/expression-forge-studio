import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VIEW_TYPES, ViewType } from '@/types/face-application';
import type { 
  AIApplyJob, 
  AIApplyOutput, 
  AIApplyLook, 
  AIApplyViewStatus,
  ViewPairing 
} from '@/types/ai-apply';

interface SourceImage {
  id: string;
  look_id: string;
  view: string;
  source_url: string;
  head_cropped_url: string | null;
}

interface SelectedHeadRender {
  lookId: string;
  view: string;
  url: string;
  outputId: string;
}

interface UseAIApplyDataOptions {
  projectId: string;
}

export function useAIApplyData({ projectId }: UseAIApplyDataOptions) {
  const [looks, setLooks] = useState<AIApplyLook[]>([]);
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);
  const [selectedHeadRenders, setSelectedHeadRenders] = useState<SelectedHeadRender[]>([]);
  const [talentInfo, setTalentInfo] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate pairing for a view
  const calculatePairing = useCallback((
    lookId: string, 
    view: string,
    srcImages: SourceImage[],
    headRenders: SelectedHeadRender[]
  ): ViewPairing => {
    const warnings: string[] = [];
    const missingRequirements: string[] = [];
    
    // Get body image for this view
    let bodyImage: ViewPairing['bodyImage'] = null;
    const exactBody = srcImages.find(s => s.look_id === lookId && s.view === view);
    
    if (exactBody) {
      bodyImage = {
        id: exactBody.id,
        url: exactBody.source_url,
        source: 'exact',
      };
    } else {
      // Fallback logic
      if (view === 'back') {
        // Back MUST have a back body image
        missingRequirements.push('Back view requires a back body image');
      } else if (view === 'cropped_front' || view === 'detail') {
        // Try full_front as fallback
        const fallback = srcImages.find(s => s.look_id === lookId && s.view === 'full_front');
        if (fallback) {
          bodyImage = {
            id: fallback.id,
            url: fallback.source_url,
            source: 'fallback',
            fallbackFrom: 'full_front',
          };
          warnings.push(`${view === 'detail' ? 'Detail' : 'Cropped Front'} uses Full Front body as fallback`);
        } else {
          // Try 'front' (legacy)
          const legacyFront = srcImages.find(s => s.look_id === lookId && s.view === 'front');
          if (legacyFront) {
            bodyImage = {
              id: legacyFront.id,
              url: legacyFront.source_url,
              source: 'fallback',
              fallbackFrom: 'front',
            };
            warnings.push(`${view === 'detail' ? 'Detail' : 'Cropped Front'} uses Front body as fallback`);
          }
        }
      } else if (view === 'full_front') {
        // Try 'front' (legacy)
        const legacyFront = srcImages.find(s => s.look_id === lookId && s.view === 'front');
        if (legacyFront) {
          bodyImage = {
            id: legacyFront.id,
            url: legacyFront.source_url,
            source: 'fallback',
            fallbackFrom: 'front',
          };
        }
      }
      
      if (!bodyImage) {
        missingRequirements.push(`No body image found for ${view}`);
      }
    }

    // Get head render for this view
    let headRender: ViewPairing['headRender'] = null;
    const exactHead = headRenders.find(h => h.lookId === lookId && h.view === view);
    
    if (exactHead) {
      headRender = {
        id: exactHead.outputId,
        url: exactHead.url,
        angleMatch: 'exact',
      };
    } else {
      // Reuse front head for front views
      const frontViews = ['full_front', 'front', 'cropped_front', 'detail'];
      if (frontViews.includes(view)) {
        const frontHead = headRenders.find(h => 
          h.lookId === lookId && frontViews.includes(h.view)
        );
        if (frontHead) {
          headRender = {
            id: frontHead.outputId,
            url: frontHead.url,
            angleMatch: 'reused',
            originalView: frontHead.view,
          };
        }
      } else if (view === 'back') {
        // For back view, try to find back/side head, otherwise use front with risk warning
        const backHead = headRenders.find(h => 
          h.lookId === lookId && (h.view === 'back' || h.view === 'side')
        );
        if (backHead) {
          headRender = {
            id: backHead.outputId,
            url: backHead.url,
            angleMatch: 'exact',
          };
        } else {
          // Use front head with angle risk warning
          const frontHead = headRenders.find(h => 
            h.lookId === lookId && frontViews.includes(h.view)
          );
          if (frontHead) {
            headRender = {
              id: frontHead.outputId,
              url: frontHead.url,
              angleMatch: 'risk',
              originalView: frontHead.view,
            };
            warnings.push('Back view using front head - angle mismatch risk');
          }
        }
      }
      
      if (!headRender) {
        missingRequirements.push(`No selected head render found for ${view}`);
      }
    }

    return {
      view,
      bodyImage,
      headRender,
      warnings,
      canRun: bodyImage !== null && headRender !== null && missingRequirements.length === 0,
      missingRequirements,
    };
  }, []);

  // Calculate view status from outputs
  const calculateViewStatus = useCallback((
    outputs: AIApplyOutput[], 
    view: string,
    pairing: ViewPairing
  ): AIApplyViewStatus => {
    const viewOutputs = outputs.filter(o => o.view === view);
    const completed = viewOutputs.filter(o => o.status === 'completed' && o.stored_url);
    const failed = viewOutputs.filter(o => o.status === 'failed');
    const running = viewOutputs.filter(o => o.status === 'pending' || o.status === 'generating');
    const hasSelection = viewOutputs.some(o => o.is_selected);

    let status: AIApplyViewStatus['status'] = 'not_started';
    if (viewOutputs.length === 0) {
      status = 'not_started';
    } else if (running.length > 0) {
      status = 'running';
    } else if (failed.length > 0 && completed.length === 0) {
      status = 'failed';
    } else if (completed.length > 0 && !hasSelection) {
      status = 'needs_selection';
    } else if (completed.length > 0) {
      status = 'completed';
    }

    return {
      view,
      status,
      hasSelection,
      completedCount: completed.length,
      failedCount: failed.length,
      runningCount: running.length,
      totalAttempts: viewOutputs.length,
      outputs: viewOutputs,
      pairing,
    };
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!projectId) return;

    // Get AI Apply jobs for this project
    const { data: jobsData } = await supabase
      .from('ai_apply_jobs')
      .select('*')
      .eq('project_id', projectId);

    // Get ALL face_application_jobs to find looks with Review selections
    const { data: faceAppJobs } = await supabase
      .from('face_application_jobs')
      .select('id, look_id, digital_talent_id')
      .eq('project_id', projectId);

    if (!faceAppJobs || faceAppJobs.length === 0) {
      setLooks([]);
      setIsLoading(false);
      return;
    }

    // Get talent info
    const talentId = faceAppJobs[0].digital_talent_id;
    if (talentId) {
      const { data: talent } = await supabase
        .from('digital_talents')
        .select('name, front_face_url')
        .eq('id', talentId)
        .single();
      if (talent) setTalentInfo(talent);
    }

    // Get look names
    const lookIds = [...new Set(faceAppJobs.map(j => j.look_id))];
    const { data: looksData } = await supabase
      .from('talent_looks')
      .select('id, name')
      .in('id', lookIds);

    const lookNameMap: Record<string, string> = {};
    looksData?.forEach(l => { lookNameMap[l.id] = l.name; });

    // Get source images
    const { data: srcImages } = await supabase
      .from('look_source_images')
      .select('id, look_id, view, source_url, head_cropped_url')
      .in('look_id', lookIds);
    
    if (srcImages) setSourceImages(srcImages);

    // Get selected head renders from face_application_outputs (Review stage)
    const faceAppJobIds = faceAppJobs.map(j => j.id);
    const { data: faceAppOutputs } = await supabase
      .from('face_application_outputs')
      .select('id, job_id, view, stored_url, is_selected')
      .in('job_id', faceAppJobIds)
      .eq('is_selected', true);

    const headRenders: SelectedHeadRender[] = [];
    if (faceAppOutputs) {
      for (const output of faceAppOutputs) {
        const job = faceAppJobs.find(j => j.id === output.job_id);
        if (job && output.stored_url) {
          headRenders.push({
            lookId: job.look_id,
            view: output.view,
            url: output.stored_url,
            outputId: output.id,
          });
        }
      }
    }
    setSelectedHeadRenders(headRenders);

    // Get AI Apply outputs
    const aiApplyJobIds = jobsData?.map(j => j.id) || [];
    let aiApplyOutputs: AIApplyOutput[] = [];
    
    if (aiApplyJobIds.length > 0) {
      const { data: outputs } = await supabase
        .from('ai_apply_outputs')
        .select('*')
        .in('job_id', aiApplyJobIds)
        .order('view')
        .order('attempt_index');
      
      if (outputs) {
        aiApplyOutputs = outputs as AIApplyOutput[];
      }
    }

    // Build looks with view statuses
    const outputsByLook: Record<string, AIApplyOutput[]> = {};
    for (const lookId of lookIds) {
      outputsByLook[lookId] = [];
    }
    
    for (const output of aiApplyOutputs) {
      if (outputsByLook[output.look_id]) {
        outputsByLook[output.look_id].push(output);
      }
    }

    const aiApplyLooks: AIApplyLook[] = lookIds.map(lookId => {
      const outputs = outputsByLook[lookId] || [];
      const views: Record<string, AIApplyViewStatus> = {};
      const allWarnings: string[] = [];

      for (const viewType of VIEW_TYPES) {
        const pairing = calculatePairing(lookId, viewType, srcImages || [], headRenders);
        views[viewType] = calculateViewStatus(outputs, viewType, pairing);
        allWarnings.push(...pairing.warnings);
      }

      const isReady = VIEW_TYPES.every(v => views[v]?.hasSelection);
      const isComplete = VIEW_TYPES.every(v => 
        views[v]?.status === 'completed' || views[v]?.status === 'needs_selection'
      );

      return {
        id: lookId,
        name: lookNameMap[lookId] || 'Unknown Look',
        views,
        isReady,
        isComplete,
        hasWarnings: allWarnings.length > 0,
        warnings: [...new Set(allWarnings)],
      };
    });

    // Only include looks that have both head renders AND runnable views
    const readyLooks = aiApplyLooks.filter(look => {
      // Must have at least one selected head render
      const hasHead = headRenders.some(h => h.lookId === look.id);
      if (!hasHead) return false;
      
      // Must have at least one view that can run (has both body and head)
      const hasRunnableView = VIEW_TYPES.some(v => 
        look.views[v]?.pairing?.canRun === true
      );
      
      return hasRunnableView;
    });

    setLooks(readyLooks);
    setIsLoading(false);
  }, [projectId, calculatePairing, calculateViewStatus]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    looks,
    sourceImages,
    selectedHeadRenders,
    talentInfo,
    isLoading,
    refetch: fetchData,
  };
}
