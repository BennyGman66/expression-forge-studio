import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Save, ChevronLeft, ChevronRight, User, Trash2, MoreVertical, RefreshCw, AlertCircle, Loader2, X, Briefcase } from "lucide-react";
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
import { CreatePhotoshopJobDialog } from "./CreatePhotoshopJobDialog";

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
  const [showJobDialog, setShowJobDialog] = useState(false);
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
  const currentOutputs = currentView?.outputs || [];

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

  const handleRegenerateAll = async (lookId: string, view: string) => {
    const viewOutputs = allViews
      .find(v => v.lookId === lookId && v.view === view)
      ?.outputs || [];
    
    if (viewOutputs.length === 0) return;
    
    const ids = viewOutputs.map(o => o.id);
    setRegeneratingIds(prev => new Set([...prev, ...ids]));
    
    toast({ title: "Regenerating...", description: `Regenerating ${ids.length} images` });
    
    for (const output of viewOutputs) {
      try {
        await supabase.functions.invoke("regenerate-face-output", {
          body: { outputId: output.id },
        });
      } catch (error) {
        console.error("Regenerate error:", error);
      }
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

        {/* Current view - GRID STYLE */}
        {currentView && (
          <Card>
            <CardHeader className="py-3 flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">
                  {currentView.lookName} — <span className="capitalize">{currentView.view}</span> View
                </CardTitle>
                {getStatusBadge(currentView.lookStatus)}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{currentOutputs.length} options</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerateAll(currentView.lookId, currentView.view)}
                  disabled={currentOutputs.length === 0}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {currentOutputs.length > 0 ? (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {currentOutputs.map((output, idx) => (
                    <div key={output.id} className="relative group">
                      {/* Image */}
                      <div
                        className={`
                          aspect-square rounded-lg overflow-hidden border-4 transition-all cursor-pointer
                          ${output.is_selected
                            ? "border-primary ring-4 ring-primary/30"
                            : "border-transparent hover:border-muted-foreground/50"
                          }
                        `}
                      >
                        {regeneratingIds.has(output.id) || output.status === "pending" ? (
                          <div className="w-full h-full bg-muted flex flex-col items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : output.stored_url ? (
                          <img
                            src={output.stored_url}
                            alt={`Option ${idx + 1}`}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">No image</span>
                          </div>
                        )}
                        {output.is_selected && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>

                      {/* Quick action buttons below each image */}
                      <div className="flex justify-center gap-1.5 mt-2">
                        <Button
                          variant={output.is_selected ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleSelect(output.id)}
                          className={`h-8 w-8 p-0 ${output.is_selected ? "bg-primary hover:bg-primary/90" : ""}`}
                          disabled={regeneratingIds.has(output.id) || output.status === "pending"}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(output.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={regeneratingIds.has(output.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center">
                            <DropdownMenuItem onClick={() => handleRegenerate(output.id)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Regenerate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
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
                
                // Calculate status from actual outputs, not job status
                const completedOutputs = v.outputs.filter(o => o.stored_url && o.status === "completed");
                const pendingOutputs = v.outputs.filter(o => !o.stored_url || o.status === "pending");
                const failedOutputs = v.outputs.filter(o => o.status === "failed");
                
                const isRunning = pendingOutputs.length > 0;
                const isFailed = failedOutputs.length > 0 && completedOutputs.length === 0;
                
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
            variant="outline"
            size="lg"
            onClick={() => setShowJobDialog(true)}
            disabled={selectedCount === 0}
          >
            <Briefcase className="h-4 w-4 mr-2" />
            Create Photoshop Job
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

        {/* Photoshop Job Dialog */}
        {currentView && (
          <CreatePhotoshopJobDialog
            open={showJobDialog}
            onOpenChange={setShowJobDialog}
            projectId={projectId}
            lookId={currentView.lookId}
            lookName={currentView.lookName}
            talentName={talentInfo?.name || 'Unknown'}
            selectedOutputUrls={allViews
              .flatMap(v => v.outputs.filter(o => o.is_selected && o.stored_url).map(o => o.stored_url!))
            }
            faceFoundationUrls={talentInfo?.front_face_url ? [talentInfo.front_face_url] : []}
          />
        )}
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