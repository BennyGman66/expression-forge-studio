import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  LookHandoffStatus, 
  ViewHandoffStatus, 
  RequiredView, 
  REQUIRED_VIEWS,
  MINIMUM_REQUIRED_VIEWS,
  HandoffSummary 
} from '@/types/job-handoff';

interface UseLookHandoffDataResult {
  looks: LookHandoffStatus[];
  summary: HandoffSummary;
  isLoading: boolean;
  error: string | null;
  toggleLookInclusion: (lookId: string) => void;
  selectAllLooks: () => void;
  deselectAllLooks: () => void;
  refetch: () => void;
}

export function useLookHandoffData(projectId: string): UseLookHandoffDataResult {
  const [looks, setLooks] = useState<LookHandoffStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Fetch all looks for the project
      const { data: looksData, error: looksError } = await supabase
        .from('talent_looks')
        .select('id, name, project_id')
        .eq('project_id', projectId)
        .order('name');

      if (looksError) throw looksError;
      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setIsLoading(false);
        return;
      }

      const lookIds = looksData.map(l => l.id);

      // 2. Fetch all source images for these looks
      const { data: sourceImages, error: sourceError } = await supabase
        .from('look_source_images')
        .select('id, look_id, view, source_url')
        .in('look_id', lookIds);

      if (sourceError) throw sourceError;

      // 3. Fetch all selected outputs for these looks (via jobs)
      const { data: jobs, error: jobsError } = await supabase
        .from('face_application_jobs')
        .select('id, look_id')
        .in('look_id', lookIds);

      if (jobsError) throw jobsError;

      // 4. Fetch existing unified_jobs linked to these looks (already sent to Job Board)
      const { data: existingJobs, error: existingJobsError } = await supabase
        .from('unified_jobs')
        .select('look_id')
        .in('look_id', lookIds);

      if (existingJobsError) throw existingJobsError;

      // Create a Set of look IDs that have been sent to Job Board
      const sentLookIds = new Set(existingJobs?.map(j => j.look_id).filter(Boolean) || []);

      const jobIds = jobs?.map(j => j.id) || [];
      
      let selectedOutputs: Array<{
        id: string;
        job_id: string;
        view: string;
        stored_url: string;
        look_source_image_id: string;
      }> = [];

      if (jobIds.length > 0) {
        const { data: outputs, error: outputsError } = await supabase
          .from('face_application_outputs')
          .select('id, job_id, view, stored_url, look_source_image_id')
          .in('job_id', jobIds)
          .eq('is_selected', true)
          .eq('status', 'completed');

        if (outputsError) throw outputsError;
        selectedOutputs = outputs || [];
      }

      // Build job_id -> look_id map
      const jobToLook: Record<string, string> = {};
      jobs?.forEach(j => {
        jobToLook[j.id] = j.look_id;
      });

      // 4. Build look handoff statuses
      const lookStatuses: LookHandoffStatus[] = looksData.map(look => {
        const views: Record<RequiredView, ViewHandoffStatus> = {} as Record<RequiredView, ViewHandoffStatus>;
        let readyCount = 0;

        for (const view of REQUIRED_VIEWS) {
          // Find source image for this view
          const sourceImage = sourceImages?.find(
            si => si.look_id === look.id && normalizeView(si.view) === view
          );

          // Find selected output for this view
          const selectedOutput = selectedOutputs.find(
            o => jobToLook[o.job_id] === look.id && normalizeView(o.view) === view
          );

          const hasSelection = !!selectedOutput?.stored_url;
          if (hasSelection) readyCount++;

          views[view] = {
            view,
            hasSelection,
            selectedUrl: selectedOutput?.stored_url || null,
            sourceUrl: sourceImage?.source_url || null,
            outputId: selectedOutput?.id || null,
            sourceImageId: sourceImage?.id || null,
          };
        }

        // Determine status based on minimum required views (full_front OR back)
        const meetsMinimum = MINIMUM_REQUIRED_VIEWS.some(v => views[v].hasSelection);
        
        let status: 'ready' | 'incomplete' | 'blocking';
        if (readyCount === 0) {
          status = 'blocking'; // No views ready at all
        } else if (meetsMinimum) {
          status = 'ready'; // Has at least full_front OR back
        } else {
          status = 'incomplete'; // Has views but missing both required
        }

        const hasSentJob = sentLookIds.has(look.id);

        return {
          id: look.id,
          name: look.name,
          views,
          status,
          readyCount,
          isIncluded: meetsMinimum && !hasSentJob, // Don't auto-include if already sent
          hasSentJob,
        };
      });

      setLooks(lookStatuses);
    } catch (err) {
      console.error('Error fetching handoff data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleLookInclusion = useCallback((lookId: string) => {
    setLooks(prev => 
      prev.map(look => 
        look.id === lookId && look.status !== 'blocking'
          ? { ...look, isIncluded: !look.isIncluded }
          : look
      )
    );
  }, []);

  const selectAllLooks = useCallback(() => {
    setLooks(prev => 
      prev.map(look => 
        look.status !== 'blocking' ? { ...look, isIncluded: true } : look
      )
    );
  }, []);

  const deselectAllLooks = useCallback(() => {
    setLooks(prev => 
      prev.map(look => ({ ...look, isIncluded: false }))
    );
  }, []);

  // Calculate summary
  const summary: HandoffSummary = {
    totalLooks: looks.length,
    readyLooks: looks.filter(l => l.status === 'ready').length,
    incompleteLooks: looks.filter(l => l.status === 'incomplete').length,
    blockingLooks: looks.filter(l => l.status === 'blocking').length,
    totalJobs: looks.filter(l => l.isIncluded).length, // Any included look counts
  };

  return {
    looks,
    summary,
    isLoading,
    error,
    toggleLookInclusion,
    selectAllLooks,
    deselectAllLooks,
    refetch: fetchData,
  };
}

// Helper to normalize legacy view names to the required 4-view system
function normalizeView(view: string): RequiredView | null {
  const normalized = view.toLowerCase().replace(/[^a-z_]/g, '');
  
  if (normalized === 'full_front' || normalized === 'front') return 'full_front';
  if (normalized === 'cropped_front') return 'cropped_front';
  if (normalized === 'back') return 'back';
  if (normalized === 'detail' || normalized === 'side') return 'detail';
  
  return null;
}
