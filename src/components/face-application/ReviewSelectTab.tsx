import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Star, ChevronDown, ChevronRight, ArrowRight, Loader2, Eye, EyeOff, RefreshCw, AlertCircle, Plus, Send, RotateCcw, Upload } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/shared/OptimizedImage';
import { QuickFillDialog } from './review/QuickFillDialog';
import { LookSourceImage } from '@/types/face-application';
import { useSendToJobBoard } from '@/hooks/useSendToJobBoard';
import { LookHandoffStatus, REQUIRED_VIEWS, DEFAULT_BRIEF, RequiredView, ViewHandoffStatus } from '@/types/job-handoff';
import { useToast } from '@/hooks/use-toast';

interface ReviewSelectTabProps {
  projectId: string;
  onContinue?: () => void;
}

interface OutputItem {
  id: string;
  job_id: string;
  look_id: string;
  view: string;
  attempt_index: number;
  stored_url: string | null;
  status: string;
  is_selected: boolean;
}

interface LookGroup {
  lookId: string;
  lookName: string;
  views: Record<string, OutputItem[]>;
  selectedCount: number;
  digitalTalentId?: string | null;
}

interface SourceImageInfo {
  id: string;
  look_id: string;
  view: string;
  source_url: string;
  head_cropped_url: string | null;
  digital_talent_id: string | null;
}

interface QuickFillTarget {
  lookId: string;
  lookName: string;
  missingViews: Array<{
    view: string;
    sourceImage: {
      id: string;
      look_id: string;
      digital_talent_id: string | null;
      view: string;
      source_url: string;
      head_cropped_url: string | null;
    };
  }>;
  digitalTalentId: string | null;
}

const VIEW_ORDER = ['full_front', 'cropped_front', 'front', 'back', 'side', 'detail'];
const VIEW_LABELS: Record<string, string> = {
  full_front: 'Full Front',
  cropped_front: 'Cropped Front',
  front: 'Front',
  back: 'Back',
  side: 'Side',
  detail: 'Detail',
};

// Helper to chunk an array into smaller arrays
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Normalize view names for comparison
function normalizeView(view: string): string {
  if (view === 'full_front' || view === 'cropped_front') return 'front';
  return view;
}

// Map view names to handoff view names
function mapViewToHandoffView(view: string): RequiredView | null {
  const lower = view.toLowerCase();
  if (lower === 'full_front' || lower === 'front') return 'full_front';
  if (lower === 'cropped_front') return 'cropped_front';
  if (lower === 'back') return 'back';
  if (lower === 'side' || lower === 'detail') return 'detail';
  return null;
}

export function ReviewSelectTab({ projectId, onContinue }: ReviewSelectTabProps) {
  const { toast } = useToast();
  const { sendToJobBoard, isSending } = useSendToJobBoard();
  
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [looks, setLooks] = useState<Record<string, string>>({});
  const [sourceImages, setSourceImages] = useState<SourceImageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set());
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [expandedUnselectedViews, setExpandedUnselectedViews] = useState<Set<string>>(new Set());
  const [quickFillTarget, setQuickFillTarget] = useState<QuickFillTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Job Board sending state
  const [sentLookIds, setSentLookIds] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState<string>('');
  const [lookTalentMap, setLookTalentMap] = useState<Record<string, string | null>>({});
  
  // Track which looks have unsaved changes since being sent
  const [dirtyLookIds, setDirtyLookIds] = useState<Set<string>>(new Set());
  
  // Track regenerating views
  const [regeneratingView, setRegeneratingView] = useState<string | null>(null);
  
  // Track updating jobs
  const [updatingJobLookId, setUpdatingJobLookId] = useState<string | null>(null);

  // Fetch outputs, look names, and source images with chunked queries
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setFetchError(null);
      
      try {
        // Get all looks for this project first
        const { data: allLooks, error: looksError } = await supabase
          .from('talent_looks')
          .select('id, name, look_code, digital_talent_id')
          .eq('project_id', projectId);

        if (looksError) {
          console.error('Error fetching looks:', looksError);
          setFetchError(`Failed to load looks: ${looksError.message}`);
          setLoading(false);
          return;
        }

        const lookIds = allLooks?.map(l => l.id) || [];
        const lookMap: Record<string, string> = {};
        const lookTalentMap: Record<string, string | null> = {};
        
        allLooks?.forEach(l => {
          lookMap[l.id] = l.look_code || l.name || l.id.slice(0, 8);
          lookTalentMap[l.id] = l.digital_talent_id;
        });

        // Get all source images for these looks
        if (lookIds.length > 0) {
          const CHUNK_SIZE = 50;
          const lookIdChunks = chunkArray(lookIds, CHUNK_SIZE);
          const allSourceImages: SourceImageInfo[] = [];
          
          for (const chunk of lookIdChunks) {
            const { data: sourceData } = await supabase
              .from('look_source_images')
              .select('id, look_id, view, source_url, head_cropped_url, digital_talent_id')
              .in('look_id', chunk);
            
            if (sourceData) {
              allSourceImages.push(...sourceData);
            }
          }
          
          setSourceImages(allSourceImages);
        }

        // Get all jobs for this project
        const { data: jobs, error: jobsError } = await supabase
          .from('ai_apply_jobs')
          .select('id, look_id')
          .eq('project_id', projectId);

        if (jobsError) {
          console.error('Error fetching jobs:', jobsError);
          setFetchError(`Failed to load jobs: ${jobsError.message}`);
          setLoading(false);
          return;
        }

        if (!jobs || jobs.length === 0) {
          setLooks(lookMap);
          setLoading(false);
          return;
        }

        const jobIds = jobs.map(j => j.id);

        // Fetch outputs in chunks to avoid query size limits
        const CHUNK_SIZE = 50;
        const jobIdChunks = chunkArray(jobIds, CHUNK_SIZE);
        
        const allOutputs: OutputItem[] = [];
        const outputIds = new Set<string>();
        
        for (const chunk of jobIdChunks) {
          const { data: chunkData, error: chunkError } = await supabase
            .from('ai_apply_outputs')
            .select('*')
            .in('job_id', chunk)
            .eq('status', 'completed')
            .not('stored_url', 'is', null);
          
          if (chunkError) {
            console.error('Error fetching output chunk:', chunkError);
            continue;
          }
          
          if (chunkData) {
            for (const output of chunkData) {
              if (!outputIds.has(output.id)) {
                outputIds.add(output.id);
                allOutputs.push(output as OutputItem);
              }
            }
          }
        }

        // Sort outputs after fetching all chunks
        allOutputs.sort((a, b) => {
          if (a.look_id !== b.look_id) return (a.look_id || '').localeCompare(b.look_id || '');
          if (a.view !== b.view) return a.view.localeCompare(b.view);
          return a.attempt_index - b.attempt_index;
        });

        setOutputs(allOutputs);
        setLooks(lookMap);
        setLookTalentMap(lookTalentMap);
        
        // Start with looks COLLAPSED by default for fast send workflow
        setExpandedLooks(new Set());
        
        // Auto-enable "selected only" if there are selections
        const hasSelections = allOutputs.some(o => o.is_selected);
        if (hasSelections) {
          setShowSelectedOnly(true);
        }
        
        console.log(`Loaded ${allOutputs.length} outputs, ${sourceImages.length} source images`);
      } catch (err) {
        console.error('Unexpected error in fetchData:', err);
        setFetchError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      
      setLoading(false);
    }

    fetchData();
  }, [projectId, refreshKey]);

  // Fetch project name and already-sent looks
  useEffect(() => {
    async function fetchProjectAndSentLooks() {
      // Get project name
      const { data: projectData } = await supabase
        .from('face_application_projects')
        .select('name')
        .eq('id', projectId)
        .single();
      
      if (projectData) {
        setProjectName(projectData.name);
      }
      
      // Get looks that already have jobs sent
      const { data: sentJobs } = await supabase
        .from('unified_jobs')
        .select('look_id')
        .eq('project_id', projectId)
        .not('look_id', 'is', null);
      
      if (sentJobs) {
        setSentLookIds(new Set(sentJobs.map(j => j.look_id).filter(Boolean) as string[]));
      }
    }
    
    fetchProjectAndSentLooks();
  }, [projectId, refreshKey]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('review-select-outputs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_apply_outputs',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as OutputItem;
            setOutputs(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o));
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as OutputItem;
            if (inserted.status === 'completed' && inserted.stored_url) {
              setOutputs(prev => [...prev, inserted]);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Group outputs by look and view
  const groupedByLook = useMemo(() => {
    const groups: LookGroup[] = [];
    const lookMap = new Map<string, LookGroup>();

    for (const output of outputs) {
      if (!output.look_id) continue;

      let group = lookMap.get(output.look_id);
      if (!group) {
        group = {
          lookId: output.look_id,
          lookName: looks[output.look_id] || output.look_id.slice(0, 8),
          views: {},
          selectedCount: 0,
        };
        lookMap.set(output.look_id, group);
        groups.push(group);
      }

      if (!group.views[output.view]) {
        group.views[output.view] = [];
      }
      group.views[output.view].push(output);
    }

    // Sort views within each group and calculate selected count
    for (const group of groups) {
      let selectedCount = 0;
      for (const view of Object.keys(group.views)) {
        // Sort with selected first, then by attempt index
        group.views[view].sort((a, b) => {
          if (a.is_selected !== b.is_selected) return b.is_selected ? 1 : -1;
          return a.attempt_index - b.attempt_index;
        });
        if (group.views[view].some(o => o.is_selected)) {
          selectedCount++;
        }
      }
      group.selectedCount = selectedCount;
    }

    // Sort groups by selected count (more selections first)
    groups.sort((a, b) => b.selectedCount - a.selectedCount);

    return groups;
  }, [outputs, looks]);

  // Get ALL source images by look for "Add new" functionality (regenerate any view)
  const allViewsByLook = useMemo(() => {
    const all: Record<string, { view: string; sourceImage: SourceImageInfo }[]> = {};
    
    for (const srcImg of sourceImages) {
      if (!srcImg.look_id) continue;
      
      if (!all[srcImg.look_id]) all[srcImg.look_id] = [];
      all[srcImg.look_id].push({ view: srcImg.view, sourceImage: srcImg });
    }
    
    return all;
  }, [sourceImages]);

  // Calculate selection stats
  const stats = useMemo(() => {
    let totalViews = 0;
    let selectedViews = 0;

    for (const group of groupedByLook) {
      for (const view of Object.keys(group.views)) {
        totalViews++;
        if (group.views[view].some(o => o.is_selected)) {
          selectedViews++;
        }
      }
    }

    return { totalViews, selectedViews, looksCount: groupedByLook.length };
  }, [groupedByLook]);

  // Handle selection
  const handleSelect = async (output: OutputItem) => {
    setSelectingId(output.id);
    
    try {
      // Deselect any other selected output for this look+view
      const sameViewOutputs = outputs.filter(
        o => o.look_id === output.look_id && o.view === output.view && o.id !== output.id
      );
      
      for (const other of sameViewOutputs) {
        if (other.is_selected) {
          await supabase
            .from('ai_apply_outputs')
            .update({ is_selected: false })
            .eq('id', other.id);
        }
      }

      // Toggle this output's selection
      const newSelected = !output.is_selected;
      await supabase
        .from('ai_apply_outputs')
        .update({ is_selected: newSelected })
        .eq('id', output.id);

      // Update local state
      setOutputs(prev => prev.map(o => {
        if (o.look_id === output.look_id && o.view === output.view) {
          return { ...o, is_selected: o.id === output.id ? newSelected : false };
        }
        return o;
      }));
      
      // Mark as dirty if this look was already sent
      if (sentLookIds.has(output.look_id)) {
        setDirtyLookIds(prev => new Set([...prev, output.look_id]));
      }
      
      // Sync new selection to Job Board if the look already has an active job
      if (newSelected && output.stored_url) {
        const { data: existingJob } = await supabase
          .from('unified_jobs')
          .select('id')
          .eq('look_id', output.look_id)
          .in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'NEEDS_CHANGES'])
          .maybeSingle();

        if (existingJob) {
          const normalizedView = output.view.toLowerCase();
          const viewUpper = normalizedView.replace('full_', '').replace('cropped_', '').toUpperCase();
          const artifactType = viewUpper === 'FRONT' ? 'HEAD_RENDER_FRONT' 
            : viewUpper === 'SIDE' || viewUpper === 'DETAIL' ? 'HEAD_RENDER_SIDE'
            : viewUpper === 'BACK' ? 'HEAD_RENDER_BACK'
            : 'HEAD_RENDER_FRONT';

          // Create artifact for the new head render
          const { data: artifact } = await supabase
            .from('unified_artifacts')
            .insert({
              project_id: projectId,
              look_id: output.look_id,
              type: artifactType,
              file_url: output.stored_url,
              source_table: 'ai_apply_outputs',
              source_id: output.id,
              metadata: { view: normalizedView, added_after_handoff: true },
            })
            .select()
            .single();

          if (artifact) {
            await supabase
              .from('job_inputs')
              .insert({
                job_id: existingJob.id,
                artifact_id: artifact.id,
                label: `Head render ${normalizedView} (updated)`,
              });
            console.log('[ReviewSelectTab] Synced selection to Job Board:', { 
              lookId: output.look_id, 
              view: normalizedView, 
              artifactId: artifact.id 
            });
          }
        }
      }
    } finally {
      setSelectingId(null);
    }
  };
  
  // Regenerate a specific view for a look
  const handleRegenerateView = async (lookId: string, view: string) => {
    const viewKey = `${lookId}:${view}`;
    setRegeneratingView(viewKey);
    
    try {
      // Find source image for this look+view
      const sourceImage = sourceImages.find(
        s => s.look_id === lookId && normalizeView(s.view) === normalizeView(view)
      );
      
      if (!sourceImage?.head_cropped_url) {
        toast({ 
          title: "Cannot Regenerate", 
          description: "Head crop is required for this view. Go to Head Crop tab first.", 
          variant: "destructive" 
        });
        return;
      }
      
      // Get the digital talent ID
      const talentId = sourceImage.digital_talent_id || lookTalentMap[lookId];
      
      if (!talentId) {
        toast({ 
          title: "Cannot Regenerate", 
          description: "No digital talent assigned to this look.", 
          variant: "destructive" 
        });
        return;
      }
      
      // Call the generate-ai-apply edge function for just this view
      const { error } = await supabase.functions.invoke('generate-ai-apply', {
        body: { 
          projectId, 
          lookId, 
          view, // Single view
          type: 'add_more',
          attemptsPerView: 3,
        }
      });
      
      if (error) {
        toast({ 
          title: "Error", 
          description: error.message || "Failed to start generation", 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Generating", 
          description: `Regenerating ${VIEW_LABELS[view] || view} view with 3 new attempts...` 
        });
        // Refresh to show new pending outputs after a short delay
        setTimeout(() => refetch(), 2000);
      }
    } catch (err) {
      console.error('Regenerate error:', err);
      toast({ 
        title: "Error", 
        description: "Failed to regenerate view", 
        variant: "destructive" 
      });
    } finally {
      setRegeneratingView(null);
    }
  };
  
  // Update an existing job with new selections
  const handleUpdateSentJob = async (lookId: string) => {
    setUpdatingJobLookId(lookId);
    
    try {
      // Find the existing job for this look
      const { data: existingJob, error: jobError } = await supabase
        .from('unified_jobs')
        .select('id, job_group_id')
        .eq('look_id', lookId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (jobError || !existingJob) {
        toast({ 
          title: "Error", 
          description: "Could not find existing job for this look", 
          variant: "destructive" 
        });
        return;
      }
      
      // Get current selected outputs for this look
      const group = groupedByLook.find(g => g.lookId === lookId);
      if (!group) return;
      
      // Update artifacts with new selections
      for (const viewKey of Object.keys(group.views)) {
        const selectedOutput = group.views[viewKey].find(o => o.is_selected);
        if (!selectedOutput?.stored_url) continue;
        
        const renderType = getHeadRenderType(viewKey);
        
        // Find existing artifact for this view
        const { data: existingArtifact } = await supabase
          .from('unified_artifacts')
          .select('id')
          .eq('look_id', lookId)
          .eq('type', renderType)
          .maybeSingle();
        
        if (existingArtifact) {
          // Update the artifact with new URL
          await supabase
            .from('unified_artifacts')
            .update({ 
              file_url: selectedOutput.stored_url,
              source_id: selectedOutput.id,
            })
            .eq('id', existingArtifact.id);
        } else {
          // Create new artifact if it doesn't exist
          const { data: newArtifact } = await supabase
            .from('unified_artifacts')
            .insert({
              project_id: projectId,
              look_id: lookId,
              type: renderType as any,
              file_url: selectedOutput.stored_url,
              source_table: 'ai_apply_outputs',
              source_id: selectedOutput.id,
              metadata: { view: viewKey },
            })
            .select()
            .single();
          
          // Link to job
          if (newArtifact) {
            await supabase
              .from('job_inputs')
              .insert({
                job_id: existingJob.id,
                artifact_id: newArtifact.id,
                label: `Head render ${viewKey.replace('_', ' ')}`,
              });
          }
        }
      }
      
      // Create audit event
      await supabase
        .from('audit_events')
        .insert({
          project_id: projectId,
          action: 'JOB_ARTIFACTS_UPDATED',
          metadata: {
            job_id: existingJob.id,
            look_id: lookId,
            updated_views: Object.keys(group.views).filter(v => 
              group.views[v].some(o => o.is_selected)
            ),
          },
        });
      
      // Remove from dirty set
      setDirtyLookIds(prev => {
        const next = new Set(prev);
        next.delete(lookId);
        return next;
      });
      
      toast({ 
        title: "Updated", 
        description: "Job artifacts updated with new selections" 
      });
    } catch (err) {
      console.error('Update job error:', err);
      toast({ 
        title: "Error", 
        description: "Failed to update job", 
        variant: "destructive" 
      });
    } finally {
      setUpdatingJobLookId(null);
    }
  };
  
  // Helper to get artifact type for a view
  const getHeadRenderType = (view: string): 'HEAD_RENDER_FRONT' | 'HEAD_RENDER_BACK' | 'HEAD_RENDER_SIDE' => {
    const normalizedView = view.toLowerCase();
    if (normalizedView === 'full_front' || normalizedView === 'cropped_front' || normalizedView === 'front') {
      return 'HEAD_RENDER_FRONT';
    }
    if (normalizedView === 'back') return 'HEAD_RENDER_BACK';
    if (normalizedView === 'side' || normalizedView === 'detail') return 'HEAD_RENDER_SIDE';
    return 'HEAD_RENDER_FRONT';
  };

  const toggleLookExpanded = (lookId: string) => {
    setExpandedLooks(prev => {
      const next = new Set(prev);
      if (next.has(lookId)) {
        next.delete(lookId);
      } else {
        next.add(lookId);
      }
      return next;
    });
  };

  const toggleViewExpanded = (lookId: string, view: string) => {
    const key = `${lookId}:${view}`;
    setExpandedUnselectedViews(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Refetch function for refresh button
  const refetch = useCallback(() => {
    setOutputs([]);
    setLooks({});
    setSourceImages([]);
    setFetchError(null);
    setRefreshKey(prev => prev + 1);
  }, []);

  // Handle quick fill completion
  const handleQuickFillComplete = useCallback(() => {
    setQuickFillTarget(null);
    refetch();
  }, [refetch]);

  // Build a LookHandoffStatus from a LookGroup for sending to Job Board
  const buildLookHandoffStatus = useCallback((group: LookGroup): LookHandoffStatus => {
    const views: Record<RequiredView, ViewHandoffStatus> = {} as Record<RequiredView, ViewHandoffStatus>;
    
    for (const reqView of REQUIRED_VIEWS) {
      // Map our view names to required views
      const matchingViews = Object.keys(group.views).filter(v => {
        const mapped = mapViewToHandoffView(v);
        return mapped === reqView;
      });
      
      const viewOutputs = matchingViews.flatMap(v => group.views[v] || []);
      const selectedOutput = viewOutputs.find(o => o.is_selected);
      const sourceImage = sourceImages.find(s => 
        s.look_id === group.lookId && mapViewToHandoffView(s.view) === reqView
      );
      
      views[reqView] = {
        view: reqView,
        hasSelection: !!selectedOutput,
        selectedUrl: selectedOutput?.stored_url || null,
        sourceUrl: sourceImage?.source_url || null,
        outputId: selectedOutput?.id || null,
        sourceImageId: sourceImage?.id || null,
      };
    }
    
    // Calculate ready status - needs at least front or back with selection
    const hasFrontOrBack = views.full_front?.hasSelection || views.back?.hasSelection;
    const readyCount = REQUIRED_VIEWS.filter(v => views[v]?.hasSelection).length;
    
    return {
      id: group.lookId,
      name: group.lookName,
      views,
      status: hasFrontOrBack ? 'ready' : 'incomplete',
      readyCount,
      isIncluded: true,
      hasSentJob: sentLookIds.has(group.lookId),
    };
  }, [sourceImages, sentLookIds]);

  // Send a single look to the Job Board
  const handleSendSingleLook = useCallback(async (lookId: string) => {
    const group = groupedByLook.find(g => g.lookId === lookId);
    if (!group) return;
    
    const lookHandoff = buildLookHandoffStatus(group);
    
    if (lookHandoff.status !== 'ready') {
      toast({
        title: 'Cannot Send',
        description: 'Look needs at least a front or back view with selection.',
        variant: 'destructive',
      });
      return;
    }
    
    const result = await sendToJobBoard({
      projectId,
      jobGroupName: projectName || 'Face Application',
      brief: DEFAULT_BRIEF,
      looks: [lookHandoff],
    });
    
    if (result.success) {
      setSentLookIds(prev => new Set([...prev, lookId]));
      toast({
        title: 'Sent!',
        description: `${group.lookName} sent to Job Board`,
      });
    }
  }, [groupedByLook, buildLookHandoffStatus, sendToJobBoard, projectId, projectName, toast]);

  // Filter groups for "selected only" mode and split into sent/unsent
  // NOTE: This must be before early returns to maintain hook order
  const displayGroups = useMemo(() => {
    let groups = groupedByLook;
    
    // Filter to show only groups with selections if in selected-only mode
    if (showSelectedOnly) {
      groups = groups.filter(g => g.selectedCount > 0);
    }
    
    // Split into sent and unsent
    const unsent = groups.filter(g => !sentLookIds.has(g.lookId));
    const sent = groups.filter(g => sentLookIds.has(g.lookId));
    
    return { unsent, sent };
  }, [groupedByLook, showSelectedOnly, sentLookIds]);

  const hasNoSelectionsInSelectedMode = showSelectedOnly && stats.selectedViews === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center space-y-4">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-destructive font-medium">Failed to load outputs</p>
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <Button variant="outline" onClick={refetch} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (groupedByLook.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No completed generations yet.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Run generation first to see outputs here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <h2 className="text-lg font-semibold">Review & Select</h2>
          <Badge variant="outline" className="text-sm">
            {stats.selectedViews} / {stats.totalViews} views selected
          </Badge>
          <Badge variant="secondary" className="text-sm">
            {stats.looksCount} looks
          </Badge>
          {sentLookIds.size > 0 && (
            <Badge variant="secondary" className="text-sm gap-1.5">
              <Send className="h-3 w-3" />
              {sentLookIds.size} sent
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {/* Show selected only toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="show-selected"
              checked={showSelectedOnly}
              onCheckedChange={setShowSelectedOnly}
            />
            <Label htmlFor="show-selected" className="text-sm flex items-center gap-1.5 cursor-pointer">
              {showSelectedOnly ? (
                <><Eye className="h-4 w-4" /> Selected only</>
              ) : (
                <><EyeOff className="h-4 w-4 text-muted-foreground" /> All outputs</>
              )}
            </Label>
          </div>

          {onContinue && stats.selectedViews > 0 && (
            <Button onClick={onContinue} className="gap-2">
              Continue to Handoff
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Selected summary */}
      {stats.selectedViews > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <Star className="h-4 w-4 text-primary fill-primary" />
          <span>
            <strong className="text-foreground">{stats.selectedViews}</strong> selections across{' '}
            <strong className="text-foreground">{groupedByLook.filter(g => g.selectedCount > 0).length}</strong> looks
          </span>
        </div>
      )}

      {/* Instructions or empty state */}
      {hasNoSelectionsInSelectedMode ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No selections saved yet.</p>
            <p className="text-sm text-muted-foreground mt-2">
              Go back to <strong>Generate</strong> and click a completed thumbnail to select it,<br />
              or switch to "All outputs" to browse and select from here.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setShowSelectedOnly(false)}
            >
              Show All Outputs
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          {showSelectedOnly 
            ? "Showing only selected outputs. Toggle off to see all attempts."
            : "Click on an image to select it as the best output for that view. Only one selection per view."}
        </p>
      )}

      {/* Look groups */}
      {!hasNoSelectionsInSelectedMode && (
        <ScrollArea className="h-[calc(100vh-320px)]">
          <div className="space-y-4 pr-4">
            {/* Unsent looks */}
            {displayGroups.unsent.map((group) => {
              const isExpanded = expandedLooks.has(group.lookId);
              const viewCount = Object.keys(group.views).length;
              const selectedCount = group.selectedCount;

              // In selected-only mode, filter to only show views with selections
              const viewsToShow = showSelectedOnly
                ? VIEW_ORDER.filter(v => group.views[v]?.some(o => o.is_selected))
                : VIEW_ORDER.filter(v => group.views[v]);

              return (
                <Card key={group.lookId}>
                  <CardHeader 
                    className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleLookExpanded(group.lookId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <CardTitle className="text-base font-medium">
                          {group.lookName}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Add new button - opens wizard for any view */}
                        {allViewsByLook[group.lookId]?.length > 0 && (() => {
                          const allViews = allViewsByLook[group.lookId];
                          const talentId = allViews[0]?.sourceImage.digital_talent_id || 
                            sourceImages.find(s => s.look_id === group.lookId && s.digital_talent_id)?.digital_talent_id ||
                            lookTalentMap[group.lookId];
                          
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Open QuickFillDialog for full workflow control
                                setQuickFillTarget({
                                  lookId: group.lookId,
                                  lookName: group.lookName,
                                  missingViews: allViews.map(v => ({
                                    view: v.view,
                                    sourceImage: {
                                      id: v.sourceImage.id,
                                      look_id: v.sourceImage.look_id,
                                      digital_talent_id: v.sourceImage.digital_talent_id,
                                      view: v.sourceImage.view,
                                      source_url: v.sourceImage.source_url,
                                      head_cropped_url: v.sourceImage.head_cropped_url,
                                    },
                                  })),
                                  digitalTalentId: talentId || null,
                                });
                              }}
                            >
                              <Plus className="h-3 w-3" />
                              Add new
                            </Button>
                          );
                        })()}
                        <Badge 
                          variant={selectedCount === viewCount ? "default" : "outline"}
                          className={cn(
                            "text-xs",
                            selectedCount === viewCount && "bg-primary"
                          )}
                        >
                          {selectedCount === viewCount ? (
                            <><Check className="h-3 w-3 mr-1" /> Complete</>
                          ) : (
                            `${selectedCount}/${viewCount} selected`
                          )}
                        </Badge>
                        
                        {/* Send to Job Board button - visible when at least 1 selection */}
                        {selectedCount > 0 && (
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            disabled={isSending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendSingleLook(group.lookId);
                            }}
                          >
                            {isSending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Send
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 space-y-6">
                      {viewsToShow.map((view) => {
                        const viewOutputs = group.views[view];
                        const selectedOutput = viewOutputs.find(o => o.is_selected);
                        const viewKey = `${group.lookId}:${view}`;
                        const isViewExpanded = expandedUnselectedViews.has(viewKey);

                        // In selected-only mode, show only the selected output (or option to expand)
                        const outputsToShow = showSelectedOnly && selectedOutput && !isViewExpanded
                          ? [selectedOutput]
                          : viewOutputs;

                        return (
                          <div key={view} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {VIEW_LABELS[view] || view}
                                </span>
                                {selectedOutput && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <Star className="h-3 w-3 fill-primary text-primary" />
                                    Selected
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2">
                                
                                {/* Show "view all" option in selected-only mode */}
                                {showSelectedOnly && selectedOutput && viewOutputs.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-6 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleViewExpanded(group.lookId, view);
                                    }}
                                  >
                                    {isViewExpanded ? 'Show selected only' : `View all ${viewOutputs.length} attempts`}
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className={cn(
                              "grid gap-3",
                              showSelectedOnly && selectedOutput && !isViewExpanded
                                ? "grid-cols-1 max-w-xs"
                                : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                            )}>
                              {outputsToShow.map((output, idx) => (
                                <button
                                  key={output.id}
                                  onClick={() => handleSelect(output)}
                                  disabled={selectingId === output.id}
                                  className={cn(
                                    "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02]",
                                    output.is_selected
                                      ? "border-primary ring-2 ring-primary ring-offset-2"
                                      : "border-border hover:border-primary/50"
                                  )}
                                >
                                  <OptimizedImage
                                    src={output.stored_url}
                                    alt={`${view} attempt ${idx + 1}`}
                                    tier="preview"
                                    className="object-cover"
                                    containerClassName="w-full h-full"
                                  />
                                  
                                  {/* Attempt number */}
                                  <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                                    #{output.attempt_index + 1}
                                  </div>

                                  {/* Selection indicator */}
                                  {output.is_selected && (
                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                      <div className="bg-primary text-primary-foreground rounded-full p-2">
                                        <Check className="h-5 w-5" />
                                      </div>
                                    </div>
                                  )}

                                  {/* Loading state */}
                                  {selectingId === output.id && (
                                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {/* Sent looks section */}
            {displayGroups.sent.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-4 pb-2">
                  <Separator className="flex-1" />
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Sent to Job Board ({displayGroups.sent.length})
                  </span>
                  <Separator className="flex-1" />
                </div>

                {displayGroups.sent.map((group) => {
                  const isExpanded = expandedLooks.has(group.lookId);
                  const viewCount = Object.keys(group.views).length;
                  const selectedCount = group.selectedCount;

                  // In selected-only mode, filter to only show views with selections
                  const viewsToShow = showSelectedOnly
                    ? VIEW_ORDER.filter(v => group.views[v]?.some(o => o.is_selected))
                    : VIEW_ORDER.filter(v => group.views[v]);

                  return (
                    <Card key={group.lookId} className="bg-muted/30">
                      <CardHeader 
                        className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleLookExpanded(group.lookId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <CardTitle className="text-base font-medium">
                              {group.lookName}
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Add new button - opens wizard for any view */}
                            {allViewsByLook[group.lookId]?.length > 0 && (() => {
                              const allViews = allViewsByLook[group.lookId];
                              const talentId = allViews[0]?.sourceImage.digital_talent_id || 
                                sourceImages.find(s => s.look_id === group.lookId && s.digital_talent_id)?.digital_talent_id ||
                                lookTalentMap[group.lookId];
                              
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5 h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Open QuickFillDialog for full workflow control
                                    setQuickFillTarget({
                                      lookId: group.lookId,
                                      lookName: group.lookName,
                                      missingViews: allViews.map(v => ({
                                        view: v.view,
                                        sourceImage: {
                                          id: v.sourceImage.id,
                                          look_id: v.sourceImage.look_id,
                                          digital_talent_id: v.sourceImage.digital_talent_id,
                                          view: v.sourceImage.view,
                                          source_url: v.sourceImage.source_url,
                                          head_cropped_url: v.sourceImage.head_cropped_url,
                                        },
                                      })),
                                      digitalTalentId: talentId || null,
                                    });
                                  }}
                                >
                                  <Plus className="h-3 w-3" />
                                  Add new
                                </Button>
                              );
                            })()}
                            <Badge 
                              variant={selectedCount === viewCount ? "default" : "outline"}
                              className={cn(
                                "text-xs",
                                selectedCount === viewCount && "bg-primary"
                              )}
                            >
                              {selectedCount === viewCount ? (
                                <><Check className="h-3 w-3 mr-1" /> Complete</>
                              ) : (
                                `${selectedCount}/${viewCount} selected`
                              )}
                            </Badge>
                            
                            {/* Update Job button if dirty, otherwise Sent badge */}
                            {dirtyLookIds.has(group.lookId) ? (
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1.5 h-7 text-xs bg-amber-600 hover:bg-amber-700"
                                disabled={updatingJobLookId === group.lookId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateSentJob(group.lookId);
                                }}
                              >
                                {updatingJobLookId === group.lookId ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Upload className="h-3 w-3" />
                                )}
                                Update Job
                              </Button>
                            ) : (
                              <Badge variant="secondary" className="gap-1.5 text-xs">
                                <Send className="h-3 w-3" />
                                Sent
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="pt-0 space-y-6">
                          {viewsToShow.map((view) => {
                            const viewOutputs = group.views[view];
                            const selectedOutput = viewOutputs.find(o => o.is_selected);
                            const viewKey = `${group.lookId}:${view}`;
                            const isViewExpanded = expandedUnselectedViews.has(viewKey);

                            // In selected-only mode, show only the selected output (or option to expand)
                            const outputsToShow = showSelectedOnly && selectedOutput && !isViewExpanded
                              ? [selectedOutput]
                              : viewOutputs;

                            return (
                              <div key={view} className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">
                                      {VIEW_LABELS[view] || view}
                                    </span>
                                    {selectedOutput && (
                                      <Badge variant="secondary" className="text-xs gap-1">
                                        <Star className="h-3 w-3 fill-primary text-primary" />
                                        Selected
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    
                                    {/* Show "view all" option in selected-only mode */}
                                    {showSelectedOnly && selectedOutput && viewOutputs.length > 1 && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-6 px-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleViewExpanded(group.lookId, view);
                                        }}
                                      >
                                        {isViewExpanded ? 'Show selected only' : `View all ${viewOutputs.length} attempts`}
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                <div className={cn(
                                  "grid gap-3",
                                  showSelectedOnly && selectedOutput && !isViewExpanded
                                    ? "grid-cols-1 max-w-xs"
                                    : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                                )}>
                                  {outputsToShow.map((output, idx) => (
                                    <button
                                      key={output.id}
                                      onClick={() => handleSelect(output)}
                                      disabled={selectingId === output.id}
                                      className={cn(
                                        "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02]",
                                        output.is_selected
                                          ? "border-primary ring-2 ring-primary ring-offset-2"
                                          : "border-border hover:border-primary/50"
                                      )}
                                    >
                                      <OptimizedImage
                                        src={output.stored_url}
                                        alt={`${view} attempt ${idx + 1}`}
                                        tier="preview"
                                        className="object-cover"
                                        containerClassName="w-full h-full"
                                      />
                                      
                                      {/* Attempt number */}
                                      <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                                        #{output.attempt_index + 1}
                                      </div>

                                      {/* Selection indicator */}
                                      {output.is_selected && (
                                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                          <div className="bg-primary text-primary-foreground rounded-full p-2">
                                            <Check className="h-5 w-5" />
                                          </div>
                                        </div>
                                      )}

                                      {/* Loading state */}
                                      {selectingId === output.id && (
                                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                                          <Loader2 className="h-5 w-5 animate-spin" />
                                        </div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Quick Fill Dialog */}
      {quickFillTarget && (
        <QuickFillDialog
          open={!!quickFillTarget}
          onClose={() => setQuickFillTarget(null)}
          lookId={quickFillTarget.lookId}
          lookName={quickFillTarget.lookName}
          missingViews={quickFillTarget.missingViews}
          digitalTalentId={quickFillTarget.digitalTalentId}
          projectId={projectId}
          onComplete={handleQuickFillComplete}
        />
      )}
    </div>
  );
}
