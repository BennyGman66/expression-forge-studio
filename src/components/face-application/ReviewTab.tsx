import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Save, ChevronLeft, ChevronRight, User, Trash2, MoreVertical, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FaceApplicationOutput, FaceApplicationJob } from "@/types/face-application";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface ReviewTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
}

interface LookWithOutputs {
  id: string;
  name: string;
  status: string;
  outputs: FaceApplicationOutput[];
}

interface TalentInfo {
  name: string;
  front_face_url: string | null;
}

export function ReviewTab({ projectId }: ReviewTabProps) {
  const [looks, setLooks] = useState<LookWithOutputs[]>([]);
  const [saving, setSaving] = useState(false);
  const [talentInfo, setTalentInfo] = useState<TalentInfo | null>(null);
  const [currentViewIndex, setCurrentViewIndex] = useState(0);
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
  const [variationIndex, setVariationIndex] = useState<Record<string, number>>({});
  const { toast } = useToast();

  // Fetch all jobs and outputs for this project (regardless of status)
  useEffect(() => {
    if (!projectId) return;

    const fetchOutputs = async () => {
      // Get ALL jobs for this project (not just completed)
      const { data: jobsData } = await supabase
        .from("face_application_jobs")
        .select("id, look_id, digital_talent_id, status")
        .eq("project_id", projectId);

      if (!jobsData || jobsData.length === 0) {
        setLooks([]);
        return;
      }

      // Get talent info from first job
      const firstTalentId = jobsData[0].digital_talent_id;
      if (firstTalentId) {
        const { data: talent } = await supabase
          .from("digital_talents")
          .select("name, front_face_url")
          .eq("id", firstTalentId)
          .single();
        if (talent) setTalentInfo(talent);
      }

      // Get look names
      const lookIds = [...new Set(jobsData.map(j => j.look_id))];
      const { data: looksData } = await supabase
        .from("talent_looks")
        .select("id, name")
        .in("id", lookIds);

      const lookNameMap: Record<string, string> = {};
      looksData?.forEach(l => { lookNameMap[l.id] = l.name; });

      // Get all outputs for these jobs (all statuses for visibility)
      const jobIds = jobsData.map(j => j.id);
      const { data: outputsData } = await supabase
        .from("face_application_outputs")
        .select("*")
        .in("job_id", jobIds)
        .order("view")
        .order("attempt_index");

      // Group outputs by look with job status
      const outputsByLook: Record<string, { outputs: FaceApplicationOutput[]; status: string }> = {};
      for (const job of jobsData) {
        if (!outputsByLook[job.look_id]) {
          outputsByLook[job.look_id] = { outputs: [], status: job.status };
        }
        // Take worst status: failed > running > pending > completed
        const current = outputsByLook[job.look_id].status;
        if (job.status === "failed" || current === "failed") {
          outputsByLook[job.look_id].status = "failed";
        } else if (job.status === "running" || current === "running") {
          outputsByLook[job.look_id].status = "running";
        } else if (job.status === "pending" || current === "pending") {
          outputsByLook[job.look_id].status = "pending";
        }
      }

      // Add outputs to their looks
      if (outputsData) {
        for (const output of outputsData) {
          const job = jobsData.find(j => j.id === output.job_id);
          if (job && outputsByLook[job.look_id]) {
            outputsByLook[job.look_id].outputs.push(output as FaceApplicationOutput);
          }
        }
      }

      // Build looks array
      const looksWithOutputs: LookWithOutputs[] = Object.entries(outputsByLook).map(([lookId, data]) => ({
        id: lookId,
        name: lookNameMap[lookId] || "Unknown Look",
        status: data.status,
        outputs: data.outputs,
      }));

      setLooks(looksWithOutputs);
    };

    fetchOutputs();
    
    // Poll for updates if any looks are running
    const interval = setInterval(fetchOutputs, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  // Build view list for navigation - group by look + view
  const allViews: { lookId: string; lookName: string; lookStatus: string; view: string; outputs: FaceApplicationOutput[] }[] = [];
  looks.forEach(look => {
    const viewGroups: Record<string, FaceApplicationOutput[]> = {};
    look.outputs.forEach(o => {
      if (!viewGroups[o.view]) viewGroups[o.view] = [];
      viewGroups[o.view].push(o);
    });
    Object.entries(viewGroups).forEach(([view, outputs]) => {
      allViews.push({ lookId: look.id, lookName: look.name, lookStatus: look.status, view, outputs });
    });
  });

  const currentView = allViews[currentViewIndex];
  const currentVariationIdx = currentView ? (variationIndex[`${currentView.lookId}-${currentView.view}`] || 0) : 0;
  const currentOutputs = currentView?.outputs || [];
  const currentOutput = currentOutputs[currentVariationIdx];

  const handleVariationNav = (direction: 'prev' | 'next') => {
    if (!currentView) return;
    const key = `${currentView.lookId}-${currentView.view}`;
    const maxIdx = currentOutputs.length - 1;
    setVariationIndex(prev => ({
      ...prev,
      [key]: direction === 'next' 
        ? Math.min((prev[key] || 0) + 1, maxIdx)
        : Math.max((prev[key] || 0) - 1, 0)
    }));
  };

  const handleSelect = async (outputId: string) => {
    if (!currentView) return;
    
    const clickedOutput = currentView.outputs.find(o => o.id === outputId);
    const isCurrentlySelected = clickedOutput?.is_selected;

    if (isCurrentlySelected) {
      // Deselect this one
      await supabase
        .from("face_application_outputs")
        .update({ is_selected: false })
        .eq("id", outputId);

      setLooks(prev => prev.map(look => ({
        ...look,
        outputs: look.outputs.map(o => 
          o.id === outputId ? { ...o, is_selected: false } : o
        ),
      })));
    } else {
      // Deselect all in this view, select this one
      for (const output of currentView.outputs) {
        await supabase
          .from("face_application_outputs")
          .update({ is_selected: output.id === outputId })
          .eq("id", output.id);
      }

      setLooks(prev => prev.map(look => ({
        ...look,
        outputs: look.outputs.map(o => 
          currentView.outputs.some(cv => cv.id === o.id)
            ? { ...o, is_selected: o.id === outputId }
            : o
        ),
      })));

      // Auto-advance to next view only when selecting
      if (currentViewIndex < allViews.length - 1) {
        setTimeout(() => setCurrentViewIndex(i => i + 1), 300);
      }
    }
  };

  const handleDelete = async (outputId: string) => {
    const { error } = await supabase
      .from("face_application_outputs")
      .delete()
      .eq("id", outputId);

    if (error) {
      toast({ title: "Error", description: "Failed to delete output", variant: "destructive" });
      return;
    }

    setLooks(prev => prev.map(look => ({
      ...look,
      outputs: look.outputs.filter(o => o.id !== outputId),
    })));

    // Reset variation index if needed
    if (currentView) {
      const key = `${currentView.lookId}-${currentView.view}`;
      const newMax = currentOutputs.length - 2;
      if (currentVariationIdx > newMax && newMax >= 0) {
        setVariationIndex(prev => ({ ...prev, [key]: newMax }));
      }
    }

    toast({ title: "Deleted", description: "Output removed" });
  };

  const handleRegenerate = async (outputId: string) => {
    setRegeneratingIds(prev => new Set(prev).add(outputId));
    
    try {
      const { error } = await supabase.functions.invoke("regenerate-face-output", {
        body: { outputId },
      });

      if (error) throw error;
      
      toast({ title: "Regenerating...", description: "New image will appear shortly" });
      
      // Poll for completion
      const pollInterval = setInterval(async () => {
        const { data } = await supabase
          .from("face_application_outputs")
          .select("*")
          .eq("id", outputId)
          .single();
        
        if (data && data.status !== "pending") {
          clearInterval(pollInterval);
          setRegeneratingIds(prev => {
            const next = new Set(prev);
            next.delete(outputId);
            return next;
          });
          
          if (data.status === "completed") {
            setLooks(prev => prev.map(look => ({
              ...look,
              outputs: look.outputs.map(o => o.id === outputId ? data as FaceApplicationOutput : o),
            })));
            toast({ title: "Done", description: "Image regenerated successfully" });
          } else {
            toast({ title: "Failed", description: "Regeneration failed", variant: "destructive" });
          }
        }
      }, 2000);
      
      // Timeout after 60s
      setTimeout(() => {
        clearInterval(pollInterval);
        setRegeneratingIds(prev => {
          const next = new Set(prev);
          next.delete(outputId);
          return next;
        });
      }, 60000);
      
    } catch (error: any) {
      setRegeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(outputId);
        return next;
      });
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveToLook = async () => {
    setSaving(true);

    try {
      const allOutputs = looks.flatMap(l => l.outputs);
      const selectedOutputs = allOutputs.filter(o => o.is_selected);

      if (selectedOutputs.length === 0) {
        toast({ title: "No selections", description: "Select at least one output per view.", variant: "destructive" });
        return;
      }

      // Get a talent_id from talents table for legacy compatibility
      const { data: talentData } = await supabase
        .from("talents")
        .select("id")
        .limit(1)
        .single();

      if (!talentData) {
        toast({ title: "Error", description: "No talent found", variant: "destructive" });
        return;
      }

      // Find look_id for each output
      for (const output of selectedOutputs) {
        const look = looks.find(l => l.outputs.some(o => o.id === output.id));
        if (look) {
          await supabase.from("talent_images").insert({
            talent_id: talentData.id,
            look_id: look.id,
            view: output.view,
            stored_url: output.stored_url,
          });
        }
      }

      toast({ title: "Saved to Look", description: "Selected outputs have been saved and are now available in Avatar Repose." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30"><Check className="h-3 w-3 mr-1" />Completed</Badge>;
      case "running":
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"><Loader2 className="h-3 w-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return null;
    }
  };

  const allOutputs = looks.flatMap(l => l.outputs);
  const selectedCount = allOutputs.filter(o => o.is_selected).length;
  const totalViews = allViews.length;

  if (looks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No outputs yet. Complete the generation step first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Main review area */}
      <div className="flex-1 space-y-6">
        {/* Progress indicator */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Review & Select</h2>
            <p className="text-sm text-muted-foreground">
              {selectedCount} of {totalViews} views selected
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentViewIndex === 0}
              onClick={() => setCurrentViewIndex(i => i - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2">
              {currentViewIndex + 1} / {totalViews}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentViewIndex >= totalViews - 1}
              onClick={() => setCurrentViewIndex(i => i + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Current view - CAROUSEL STYLE */}
        {currentView && (
          <Card>
            <CardHeader className="py-3 flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">
                  {currentView.lookName} — <span className="capitalize">{currentView.view}</span> View
                </CardTitle>
                {getStatusBadge(currentView.lookStatus)}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{currentOutputs.length} options</span>
              </div>
            </CardHeader>
            <CardContent>
              {currentOutputs.length > 0 ? (
                <div className="space-y-4">
                  {/* Main carousel image */}
                  <div className="relative">
                    {/* Navigation arrows */}
                    {currentOutputs.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/80"
                          disabled={currentVariationIdx === 0}
                          onClick={() => handleVariationNav('prev')}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/80"
                          disabled={currentVariationIdx >= currentOutputs.length - 1}
                          onClick={() => handleVariationNav('next')}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}

                    {/* Main image */}
                    {currentOutput && (
                      <div className="relative group">
                        <button
                          onClick={() => handleSelect(currentOutput.id)}
                          className={`
                            relative w-full aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-4 transition-all
                            ${currentOutput.is_selected
                              ? "border-primary ring-4 ring-primary/30"
                              : "border-transparent hover:border-muted-foreground/50"
                            }
                          `}
                          disabled={regeneratingIds.has(currentOutput.id) || currentOutput.status === "pending"}
                        >
                          {regeneratingIds.has(currentOutput.id) || currentOutput.status === "pending" ? (
                            <div className="w-full h-full bg-muted flex flex-col items-center justify-center">
                              <LeapfrogLoader message="Generating..." />
                            </div>
                          ) : currentOutput.stored_url ? (
                            <img
                              src={currentOutput.stored_url}
                              alt={`${currentView.view} option ${currentVariationIdx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <span className="text-muted-foreground">No image</span>
                            </div>
                          )}
                          {currentOutput.is_selected && (
                            <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-2">
                              <Check className="h-5 w-5" />
                            </div>
                          )}
                        </button>

                        {/* Actions menu */}
                        <div className="absolute top-3 left-3 z-10">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/90 shadow">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => handleRegenerate(currentOutput.id)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Regenerate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(currentOutput.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Counter */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                          {currentVariationIdx + 1} / {currentOutputs.length}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Thumbnail strip */}
                  {currentOutputs.length > 1 && (
                    <div className="flex justify-center gap-2 overflow-x-auto py-2">
                      {currentOutputs.map((output, idx) => (
                        <button
                          key={output.id}
                          onClick={() => {
                            const key = `${currentView.lookId}-${currentView.view}`;
                            setVariationIndex(prev => ({ ...prev, [key]: idx }));
                          }}
                          className={`
                            relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all
                            ${idx === currentVariationIdx
                              ? "border-primary ring-2 ring-primary/30"
                              : output.is_selected
                                ? "border-primary/50"
                                : "border-transparent hover:border-muted-foreground/50"
                            }
                          `}
                        >
                          {regeneratingIds.has(output.id) || output.status === "pending" ? (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" />
                            </div>
                          ) : output.stored_url ? (
                            <img
                              src={output.stored_url}
                              alt={`Option ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted" />
                          )}
                          {output.is_selected && (
                            <div className="absolute top-0.5 right-0.5 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-2.5 w-2.5" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No outputs for this view yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* All views summary with status */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">All Views Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allViews.map((v, idx) => {
                const hasSelection = v.outputs.some(o => o.is_selected);
                const isRunning = v.lookStatus === "running" || v.lookStatus === "pending";
                const isFailed = v.lookStatus === "failed";
                return (
                  <button
                    key={`${v.lookId}-${v.view}`}
                    onClick={() => setCurrentViewIndex(idx)}
                    className={`
                      px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1
                      ${idx === currentViewIndex
                        ? "bg-primary text-primary-foreground border-primary"
                        : isFailed
                          ? "bg-red-500/10 text-red-600 border-red-500/30"
                          : isRunning
                            ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                            : hasSelection
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                      }
                    `}
                  >
                    {isRunning && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isFailed && <AlertCircle className="h-3 w-3" />}
                    {v.lookName} - {v.view}
                    {hasSelection && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="lg">
            <Download className="h-4 w-4 mr-2" />
            Download Selected
          </Button>
          <Button
            size="lg"
            onClick={handleSaveToLook}
            disabled={selectedCount === 0 || saving}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save to Look"}
          </Button>
        </div>
      </div>

      {/* Talent reference sidebar */}
      <div className="w-48 flex-shrink-0">
        <div className="sticky top-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Talent Reference</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {talentInfo?.front_face_url ? (
                <img
                  src={talentInfo.front_face_url}
                  alt={talentInfo.name}
                  className="w-full aspect-square object-cover rounded-lg"
                />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <p className="text-center text-sm font-medium mt-2">
                {talentInfo?.name || "Unknown"}
              </p>
            </CardContent>
          </Card>

          {/* Original look reference */}
          {currentView && (
            <Card className="mt-4">
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Original Look</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-xs text-muted-foreground mb-2">{currentView.lookName}</p>
                <p className="text-xs font-medium capitalize">{currentView.view} View</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}