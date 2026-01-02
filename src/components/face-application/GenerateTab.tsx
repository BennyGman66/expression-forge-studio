import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, Play, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceApplicationJob } from "@/types/face-application";

interface GenerateTabProps {
  lookId: string | null;
  talentId: string | null;
  onContinue: () => void;
}

export function GenerateTab({ lookId, talentId, onContinue }: GenerateTabProps) {
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [outfitDescriptions, setOutfitDescriptions] = useState<Record<string, string>>({});
  const [faceMatches, setFaceMatches] = useState<Record<string, string>>({});
  const [attemptsPerView, setAttemptsPerView] = useState(3);
  const [job, setJob] = useState<FaceApplicationJob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [describingId, setDescribingId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch source images with cropped URLs
  useEffect(() => {
    if (!lookId) return;
    const fetchSourceImages = async () => {
      const { data } = await supabase
        .from("look_source_images")
        .select("*")
        .eq("look_id", lookId)
        .not("head_cropped_url", "is", null)
        .order("view");
      if (data) setSourceImages(data as LookSourceImage[]);
    };
    fetchSourceImages();
  }, [lookId]);

  // Fetch existing job if any
  useEffect(() => {
    if (!lookId || !talentId) return;
    const fetchJob = async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("look_id", lookId)
        .eq("digital_talent_id", talentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (data) setJob(data as FaceApplicationJob);
    };
    fetchJob();
  }, [lookId, talentId]);

  // Poll for job updates
  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("id", job.id)
        .single();
      
      if (data) {
        setJob(data as FaceApplicationJob);
        if (data.status === "completed") {
          setIsGenerating(false);
          toast({ title: "Generation complete", description: "All faces have been generated." });
        } else if (data.status === "failed") {
          setIsGenerating(false);
          toast({ title: "Generation failed", description: "Check logs for details.", variant: "destructive" });
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [job, toast]);

  const handleDescribeOutfit = async (imageId: string, imageUrl: string) => {
    setDescribingId(imageId);
    try {
      const response = await supabase.functions.invoke("generate-outfit-description", {
        body: { imageUrl },
      });

      if (response.error) throw response.error;

      const { description } = response.data;
      setOutfitDescriptions((prev) => ({ ...prev, [imageId]: description }));
      toast({ title: "Description generated", description: "Outfit has been described." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setDescribingId(null);
    }
  };

  const handleStartGeneration = async () => {
    if (!lookId || !talentId) return;
    setIsGenerating(true);

    try {
      // Create job
      const { data: newJob, error: jobError } = await supabase
        .from("face_application_jobs")
        .insert({
          look_id: lookId,
          digital_talent_id: talentId,
          attempts_per_view: attemptsPerView,
          total: sourceImages.length * attemptsPerView,
          status: "pending",
        })
        .select()
        .single();

      if (jobError) throw jobError;
      setJob(newJob as FaceApplicationJob);

      // Trigger generation
      const response = await supabase.functions.invoke("generate-face-application", {
        body: {
          jobId: newJob.id,
          outfitDescriptions,
          faceMatches,
        },
      });

      if (response.error) throw response.error;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const allDescribed = sourceImages.every((img) => outfitDescriptions[img.id]);
  const progress = job ? (job.progress / job.total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Outfit Descriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Describe Outfits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate or write outfit descriptions for each look view. These will be used in the generation prompt.
          </p>

          {sourceImages.map((img) => (
            <div key={img.id} className="grid grid-cols-[120px_1fr] gap-4 p-4 border rounded-lg">
              <div>
                <img
                  src={img.source_url}
                  alt={img.view}
                  className="w-full aspect-[3/4] object-cover rounded"
                />
                <p className="text-xs text-center mt-1 capitalize">{img.view}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Outfit Description</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDescribeOutfit(img.id, img.source_url)}
                    disabled={describingId === img.id}
                  >
                    {describingId === img.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    Auto-describe
                  </Button>
                </div>
                <Textarea
                  placeholder="e.g., A navy hooded jacket worn open over a cream ribbed zip-neck knit..."
                  value={outfitDescriptions[img.id] || ""}
                  onChange={(e) =>
                    setOutfitDescriptions((prev) => ({ ...prev, [img.id]: e.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Attempts per View</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={attemptsPerView}
                onChange={(e) => setAttemptsPerView(parseInt(e.target.value) || 3)}
              />
              <p className="text-xs text-muted-foreground">
                Generate multiple variants to choose from
              </p>
            </div>
            <div className="space-y-2">
              <Label>Total Generations</Label>
              <p className="text-2xl font-bold">
                {sourceImages.length * attemptsPerView}
              </p>
              <p className="text-xs text-muted-foreground">
                {sourceImages.length} views × {attemptsPerView} attempts
              </p>
            </div>
          </div>

          {/* Progress */}
          {job && (job.status === "running" || job.status === "pending") && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Generating...</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            onClick={handleStartGeneration}
            disabled={!allDescribed || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Generation
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!job || job.status !== "completed"}
          onClick={onContinue}
        >
          Continue to Review
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
