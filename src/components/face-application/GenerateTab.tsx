import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceApplicationJob } from "@/types/face-application";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface GenerateTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
  onContinue: () => void;
}

const ATTEMPT_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

export function GenerateTab({ projectId, lookId, talentId, onContinue }: GenerateTabProps) {
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [outfitDescriptions, setOutfitDescriptions] = useState<Record<string, string>>({});
  const [faceMatches, setFaceMatches] = useState<Record<string, string>>({});
  const [attemptsPerView, setAttemptsPerView] = useState(4);
  const [job, setJob] = useState<FaceApplicationJob | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [talent, setTalent] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const { toast } = useToast();

  // Fetch talent details
  useEffect(() => {
    if (!talentId) return;
    const fetchTalent = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("name, front_face_url")
        .eq("id", talentId)
        .single();
      if (data) setTalent(data);
    };
    fetchTalent();
  }, [talentId]);

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
      if (data) setJob(data as unknown as FaceApplicationJob);
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
        setJob(data as unknown as FaceApplicationJob);
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

  // Auto-describe a single outfit
  const describeOutfit = async (imageId: string, imageUrl: string): Promise<string | null> => {
    try {
      const response = await supabase.functions.invoke("generate-outfit-description", {
        body: { imageUrl },
      });
      if (response.error) throw response.error;
      return response.data.description;
    } catch (error) {
      console.error("Failed to describe outfit:", error);
      return null;
    }
  };

  const handleStartGeneration = async () => {
    if (!lookId || !talentId) return;
    setIsGenerating(true);

    try {
      // Auto-describe any missing outfits first
      const updatedDescriptions = { ...outfitDescriptions };
      const imagesToDescribe = sourceImages.filter((img) => !updatedDescriptions[img.id]);
      
      if (imagesToDescribe.length > 0) {
        toast({ title: "Analyzing outfits...", description: `Describing ${imagesToDescribe.length} image(s)` });
        
        // Describe in parallel
        const results = await Promise.all(
          imagesToDescribe.map(async (img) => ({
            id: img.id,
            description: await describeOutfit(img.id, img.source_url),
          }))
        );
        
        results.forEach(({ id, description }) => {
          if (description) {
            updatedDescriptions[id] = description;
          }
        });
        
        setOutfitDescriptions(updatedDescriptions);
      }

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
      setJob(newJob as unknown as FaceApplicationJob);

      // Trigger generation
      const response = await supabase.functions.invoke("generate-face-application", {
        body: {
          jobId: newJob.id,
          outfitDescriptions: updatedDescriptions,
          faceMatches,
        },
      });

      if (response.error) throw response.error;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  const progress = job ? (job.progress / job.total) * 100 : 0;
  const totalGenerations = sourceImages.length * attemptsPerView;

  return (
    <div className="space-y-6">
      {/* Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            {/* Talent Preview */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted border-2 border-primary/20">
                {talent?.front_face_url ? (
                  <img
                    src={talent.front_face_url}
                    alt={talent.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <span className="text-sm font-medium">{talent?.name || "No talent"}</span>
            </div>

            {/* Settings */}
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Options per View</label>
                  <Select
                    value={String(attemptsPerView)}
                    onValueChange={(v) => setAttemptsPerView(Number(v))}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTEMPT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={String(opt)}>
                          {opt} {opt === 1 ? "option" : "options"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Generate multiple variants to choose from
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Total Generations</label>
                  <p className="text-3xl font-bold text-primary">{totalGenerations}</p>
                  <p className="text-xs text-muted-foreground">
                    {sourceImages.length} view{sourceImages.length !== 1 ? "s" : ""} × {attemptsPerView} each
                  </p>
                </div>
              </div>

              {/* Source Images Preview */}
              {sourceImages.length > 0 && (
                <div className="flex gap-2 pt-2">
                  {sourceImages.map((img) => (
                    <div key={img.id} className="relative">
                      <img
                        src={img.source_url}
                        alt={img.view}
                        className="w-12 h-16 object-cover rounded border"
                      />
                      <span className="absolute -bottom-1 left-0 right-0 text-[10px] text-center capitalize bg-background/80 rounded-b">
                        {img.view}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progress */}
          {job && (job.status === "running" || job.status === "pending") && (
            <div className="mt-6 space-y-3 p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-4">
                <LeapfrogLoader message="" size="sm" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Generating faces...</span>
                    <span className="font-medium">{job.progress} / {job.total}</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <div className="mt-6">
            <Button
              size="lg"
              className="w-full"
              onClick={handleStartGeneration}
              disabled={sourceImages.length === 0 || isGenerating}
            >
              {isGenerating ? (
                <div className="flex items-center gap-2">
                  <LeapfrogLoader message="" size="sm" />
                  <span>Generating...</span>
                </div>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Generation
                </>
              )}
            </Button>
          </div>
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
