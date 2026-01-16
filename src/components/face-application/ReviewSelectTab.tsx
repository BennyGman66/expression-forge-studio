import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, Star, ChevronDown, ChevronRight, ArrowRight, Loader2, Eye, EyeOff, RefreshCw, AlertCircle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/shared/OptimizedImage';
import { QuickFillDialog } from './review/QuickFillDialog';
import { LookSourceImage } from '@/types/face-application';

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
  view: string;
  sourceImage: LookSourceImage;
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

export function ReviewSelectTab({ projectId, onContinue }: ReviewSelectTabProps) {
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
        
        // Auto-expand all looks initially
        setExpandedLooks(new Set(lookIds));
        
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

  // Calculate missing views - source images that exist but have no outputs
  const missingViewsByLook = useMemo(() => {
    const missing: Record<string, { view: string; sourceImage: SourceImageInfo }[]> = {};
    
    for (const srcImg of sourceImages) {
      if (!srcImg.look_id) continue;
      
      // Normalize the view name
      const normalizedSrcView = normalizeView(srcImg.view);
      
      // Check if we have any outputs for this look+view
      const hasOutputs = outputs.some(
        o => o.look_id === srcImg.look_id && normalizeView(o.view) === normalizedSrcView
      );
      
      if (!hasOutputs) {
        if (!missing[srcImg.look_id]) missing[srcImg.look_id] = [];
        missing[srcImg.look_id].push({ view: srcImg.view, sourceImage: srcImg });
      }
    }
    
    return missing;
  }, [sourceImages, outputs]);

  // Total count of missing views
  const totalMissingViews = useMemo(() => {
    return Object.values(missingViewsByLook).reduce((acc, arr) => acc + arr.length, 0);
  }, [missingViewsByLook]);

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
    } finally {
      setSelectingId(null);
    }
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

  // Filter groups for "selected only" mode
  const displayGroups = showSelectedOnly 
    ? groupedByLook.filter(g => g.selectedCount > 0)
    : groupedByLook;

  const hasNoSelectionsInSelectedMode = showSelectedOnly && stats.selectedViews === 0;

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
            {displayGroups.map((group) => {
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
                        {/* Add missing views button */}
                        {missingViewsByLook[group.lookId]?.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              const firstMissing = missingViewsByLook[group.lookId][0];
                              // Find digital talent ID from source image or look
                              const talentId = firstMissing.sourceImage.digital_talent_id || 
                                sourceImages.find(s => s.look_id === group.lookId && s.digital_talent_id)?.digital_talent_id;
                              
                              setQuickFillTarget({
                                lookId: group.lookId,
                                lookName: group.lookName,
                                view: firstMissing.view,
                                sourceImage: {
                                  id: firstMissing.sourceImage.id,
                                  look_id: firstMissing.sourceImage.look_id,
                                  digital_talent_id: firstMissing.sourceImage.digital_talent_id,
                                  view: firstMissing.sourceImage.view as any,
                                  source_url: firstMissing.sourceImage.source_url,
                                  head_crop_x: null,
                                  head_crop_y: null,
                                  head_crop_width: null,
                                  head_crop_height: null,
                                  head_cropped_url: firstMissing.sourceImage.head_cropped_url,
                                  created_at: '',
                                },
                                digitalTalentId: talentId || null,
                              });
                            }}
                          >
                            <Plus className="h-3 w-3" />
                            Add {missingViewsByLook[group.lookId].length} missing
                          </Button>
                        )}
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
          view={quickFillTarget.view}
          sourceImage={quickFillTarget.sourceImage}
          digitalTalentId={quickFillTarget.digitalTalentId}
          projectId={projectId}
          onComplete={handleQuickFillComplete}
        />
      )}
    </div>
  );
}
