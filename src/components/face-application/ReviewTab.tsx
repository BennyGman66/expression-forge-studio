import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Save, ChevronLeft, ChevronRight, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FaceApplicationOutput } from "@/types/face-application";

interface ReviewTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
}

interface LookWithOutputs {
  id: string;
  name: string;
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
  const { toast } = useToast();

  // Fetch all completed jobs and outputs for this project
  useEffect(() => {
    if (!projectId) return;

    const fetchOutputs = async () => {
      // Get all completed jobs for this project
      const { data: jobsData } = await supabase
        .from("face_application_jobs")
        .select("id, look_id, digital_talent_id")
        .eq("project_id", projectId)
        .eq("status", "completed");

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

      // Get all outputs for these jobs
      const jobIds = jobsData.map(j => j.id);
      const { data: outputsData } = await supabase
        .from("face_application_outputs")
        .select("*")
        .in("job_id", jobIds)
        .eq("status", "completed")
        .order("view")
        .order("attempt_index");

      if (!outputsData) {
        setLooks([]);
        return;
      }

      // Group outputs by look
      const outputsByLook: Record<string, FaceApplicationOutput[]> = {};
      for (const output of outputsData) {
        const job = jobsData.find(j => j.id === output.job_id);
        if (job) {
          if (!outputsByLook[job.look_id]) outputsByLook[job.look_id] = [];
          outputsByLook[job.look_id].push(output as FaceApplicationOutput);
        }
      }

      // Build looks array
      const looksWithOutputs: LookWithOutputs[] = Object.entries(outputsByLook).map(([lookId, outputs]) => ({
        id: lookId,
        name: lookNameMap[lookId] || "Unknown Look",
        outputs,
      }));

      setLooks(looksWithOutputs);
    };

    fetchOutputs();
  }, [projectId]);

  // Build view list for navigation
  const allViews: { lookId: string; lookName: string; view: string; outputs: FaceApplicationOutput[] }[] = [];
  looks.forEach(look => {
    const viewGroups: Record<string, FaceApplicationOutput[]> = {};
    look.outputs.forEach(o => {
      if (!viewGroups[o.view]) viewGroups[o.view] = [];
      viewGroups[o.view].push(o);
    });
    Object.entries(viewGroups).forEach(([view, outputs]) => {
      allViews.push({ lookId: look.id, lookName: look.name, view, outputs });
    });
  });

  const currentView = allViews[currentViewIndex];

  const handleSelect = async (outputId: string) => {
    if (!currentView) return;
    
    // Deselect all in this view, select this one
    for (const output of currentView.outputs) {
      await supabase
        .from("face_application_outputs")
        .update({ is_selected: output.id === outputId })
        .eq("id", output.id);
    }

    // Update local state
    setLooks(prev => prev.map(look => ({
      ...look,
      outputs: look.outputs.map(o => 
        currentView.outputs.some(cv => cv.id === o.id)
          ? { ...o, is_selected: o.id === outputId }
          : o
      ),
    })));

    // Auto-advance to next view
    if (currentViewIndex < allViews.length - 1) {
      setTimeout(() => setCurrentViewIndex(i => i + 1), 300);
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

        {/* Current view */}
        {currentView && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-base">
                {currentView.lookName} — <span className="capitalize">{currentView.view}</span> View
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {currentView.outputs.map((output) => (
                  <button
                    key={output.id}
                    onClick={() => handleSelect(output.id)}
                    className={`
                      relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                      ${output.is_selected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-transparent hover:border-muted-foreground/50"
                      }
                    `}
                  >
                    {output.stored_url ? (
                      <img
                        src={output.stored_url}
                        alt={`${currentView.view} attempt ${output.attempt_index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <span className="text-muted-foreground">No image</span>
                      </div>
                    )}
                    {output.is_selected && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs py-1 text-center">
                      Option {output.attempt_index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All views summary */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">All Views Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {allViews.map((v, idx) => {
                const hasSelection = v.outputs.some(o => o.is_selected);
                return (
                  <button
                    key={`${v.lookId}-${v.view}`}
                    onClick={() => setCurrentViewIndex(idx)}
                    className={`
                      px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${idx === currentViewIndex
                        ? "bg-primary text-primary-foreground border-primary"
                        : hasSelection
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                      }
                    `}
                  >
                    {v.lookName} - {v.view}
                    {hasSelection && <Check className="inline h-3 w-3 ml-1" />}
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
