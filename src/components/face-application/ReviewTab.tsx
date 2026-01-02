import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Check, Download, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FaceApplicationOutput } from "@/types/face-application";

interface ReviewTabProps {
  lookId: string | null;
  talentId: string | null;
}

interface GroupedOutputs {
  [view: string]: FaceApplicationOutput[];
}

export function ReviewTab({ lookId, talentId }: ReviewTabProps) {
  const [outputs, setOutputs] = useState<FaceApplicationOutput[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Fetch outputs
  useEffect(() => {
    if (!lookId || !talentId) return;
    
    const fetchOutputs = async () => {
      // Get the latest job for this look/talent
      const { data: jobData } = await supabase
        .from("face_application_jobs")
        .select("id")
        .eq("look_id", lookId)
        .eq("digital_talent_id", talentId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!jobData) return;

      const { data } = await supabase
        .from("face_application_outputs")
        .select("*")
        .eq("job_id", jobData.id)
        .eq("status", "completed")
        .order("view")
        .order("attempt_index");

      if (data) setOutputs(data as FaceApplicationOutput[]);
    };
    
    fetchOutputs();
  }, [lookId, talentId]);

  // Group outputs by view
  const groupedOutputs: GroupedOutputs = outputs.reduce((acc, output) => {
    if (!acc[output.view]) acc[output.view] = [];
    acc[output.view].push(output);
    return acc;
  }, {} as GroupedOutputs);

  const handleSelect = async (outputId: string, view: string) => {
    // Deselect all in this view, select this one
    const viewOutputs = groupedOutputs[view] || [];
    
    for (const output of viewOutputs) {
      await supabase
        .from("face_application_outputs")
        .update({ is_selected: output.id === outputId })
        .eq("id", output.id);
    }

    setOutputs((prev) =>
      prev.map((o) =>
        o.view === view
          ? { ...o, is_selected: o.id === outputId }
          : o
      )
    );

    toast({ title: "Selected", description: `${view} output selected.` });
  };

  const handleSaveToLook = async () => {
    if (!lookId || !talentId) return;
    setSaving(true);

    try {
      const selectedOutputs = outputs.filter((o) => o.is_selected);
      
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

      // Save each selected output to talent_images
      for (const output of selectedOutputs) {
        await supabase.from("talent_images").insert({
          talent_id: talentData.id,
          look_id: lookId,
          view: output.view,
          stored_url: output.stored_url,
        });
      }

      toast({ title: "Saved to Look", description: "Selected outputs have been saved and are now available in Avatar Repose." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = outputs.filter((o) => o.is_selected).length;
  const viewCount = Object.keys(groupedOutputs).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Review & Curate Outputs</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedCount} of {viewCount} views selected
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedOutputs).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No outputs yet. Complete the generation step first.
            </p>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedOutputs).map(([view, viewOutputs]) => (
                <div key={view} className="space-y-3">
                  <h3 className="font-medium capitalize text-lg">{view} View</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {viewOutputs.map((output) => (
                      <button
                        key={output.id}
                        onClick={() => handleSelect(output.id, view)}
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
                            alt={`${view} attempt ${output.attempt_index + 1}`}
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
                          Attempt {output.attempt_index + 1}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
  );
}
