import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Star, ChevronDown, ChevronRight, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OptimizedImage } from '@/components/shared/OptimizedImage';
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

export function ReviewSelectTab({ projectId, onContinue }: ReviewSelectTabProps) {
  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [looks, setLooks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set());
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Fetch outputs and look names
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      
      // Get all jobs for this project
      const { data: jobs } = await supabase
        .from('ai_apply_jobs')
        .select('id, look_id')
        .eq('project_id', projectId);

      if (!jobs || jobs.length === 0) {
        setLoading(false);
        return;
      }

      const jobIds = jobs.map(j => j.id);
      const lookIds = [...new Set(jobs.map(j => j.look_id).filter(Boolean))];

      // Get outputs
      const { data: outputData } = await supabase
        .from('ai_apply_outputs')
        .select('*')
        .in('job_id', jobIds)
        .eq('status', 'completed')
        .not('stored_url', 'is', null)
        .order('look_id')
        .order('view')
        .order('attempt_index');

      // Get look names
      const { data: lookData } = await supabase
        .from('talent_looks')
        .select('id, name, look_code')
        .in('id', lookIds as string[]);

      const lookMap: Record<string, string> = {};
      lookData?.forEach(l => {
        lookMap[l.id] = l.look_code || l.name || l.id.slice(0, 8);
      });

      setOutputs(outputData || []);
      setLooks(lookMap);
      
      // Auto-expand all looks initially
      setExpandedLooks(new Set(lookIds as string[]));
      setLoading(false);
    }

    fetchData();
  }, [projectId]);

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
        };
        lookMap.set(output.look_id, group);
        groups.push(group);
      }

      if (!group.views[output.view]) {
        group.views[output.view] = [];
      }
      group.views[output.view].push(output);
    }

    // Sort views within each group
    for (const group of groups) {
      for (const view of Object.keys(group.views)) {
        group.views[view].sort((a, b) => a.attempt_index - b.attempt_index);
      }
    }

    return groups;
  }, [outputs, looks]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Review & Select</h2>
          <Badge variant="outline" className="text-sm">
            {stats.selectedViews} / {stats.totalViews} views selected
          </Badge>
          <Badge variant="secondary" className="text-sm">
            {stats.looksCount} looks
          </Badge>
        </div>
        
        {onContinue && stats.selectedViews > 0 && (
          <Button onClick={onContinue} className="gap-2">
            Continue to Handoff
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Instructions */}
      <p className="text-sm text-muted-foreground">
        Click on an image to select it as the best output for that view. Only one selection per view.
      </p>

      {/* Look groups */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="space-y-4 pr-4">
          {groupedByLook.map((group) => {
            const isExpanded = expandedLooks.has(group.lookId);
            const viewCount = Object.keys(group.views).length;
            const selectedCount = Object.values(group.views).filter(
              outputs => outputs.some(o => o.is_selected)
            ).length;

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
                    {VIEW_ORDER.filter(v => group.views[v]).map((view) => {
                      const viewOutputs = group.views[view];
                      const selectedOutput = viewOutputs.find(o => o.is_selected);

                      return (
                        <div key={view} className="space-y-2">
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

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                            {viewOutputs.map((output, idx) => (
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
                                  tier="thumb"
                                  className="object-cover"
                                  containerClassName="w-full h-full"
                                />
                                
                                {/* Attempt number */}
                                <div className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                                  #{idx + 1}
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
    </div>
  );
}
