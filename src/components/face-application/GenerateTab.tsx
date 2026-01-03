import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Play, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LookSourceImage, FaceApplicationJob, FaceFoundation } from "@/types/face-application";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";

interface LookWithImages {
  id: string;
  name: string;
  digital_talent_id: string | null;
  sourceImages: LookSourceImage[];
}

interface GenerateTabProps {
  projectId: string;
  lookId: string | null;
  talentId: string | null;
  onContinue: () => void;
}

const ATTEMPT_OPTIONS = [1, 2, 4, 6, 8, 12, 24];

export function GenerateTab({ projectId, lookId, talentId, onContinue }: GenerateTabProps) {
  const [looks, setLooks] = useState<LookWithImages[]>([]);
  const [faceFoundations, setFaceFoundations] = useState<FaceFoundation[]>([]);
  const [attemptsPerView, setAttemptsPerView] = useState(4);
  const [jobs, setJobs] = useState<FaceApplicationJob[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [talentInfo, setTalentInfo] = useState<{ name: string; front_face_url: string | null } | null>(null);
  const [talentIds, setTalentIds] = useState<string[]>([]);
  const { toast } = useToast();

  // Fetch ALL looks for this PROJECT with their source images
  useEffect(() => {
    if (!projectId) return;
    const fetchLooks = async () => {
      const { data: looksData } = await supabase
        .from("talent_looks")
        .select("id, name, digital_talent_id")
        .eq("project_id", projectId)
        .order("created_at");

      if (!looksData || looksData.length === 0) {
        setLooks([]);
        setTalentIds([]);
        return;
      }

      // Extract unique talent IDs
      const uniqueTalentIds = [...new Set(looksData.map(l => l.digital_talent_id).filter(Boolean))] as string[];
      setTalentIds(uniqueTalentIds);

      // For each look, fetch source images with crops
      const looksWithImages: LookWithImages[] = [];
      for (const look of looksData) {
        const { data: images } = await supabase
          .from("look_source_images")
          .select("*")
          .eq("look_id", look.id)
          .not("head_cropped_url", "is", null)
          .order("view");

        if (images && images.length > 0) {
          looksWithImages.push({
            id: look.id,
            name: look.name,
            digital_talent_id: look.digital_talent_id,
            sourceImages: images as LookSourceImage[],
          });
        }
      }
      setLooks(looksWithImages);
    };
    fetchLooks();
  }, [projectId]);

  // Fetch talent info from first talent
  useEffect(() => {
    if (talentIds.length === 0) return;
    const fetchTalentInfo = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("name, front_face_url")
        .eq("id", talentIds[0])
        .single();
      if (data) setTalentInfo(data);
    };
    fetchTalentInfo();
  }, [talentIds]);

  // Fetch face foundations for talents
  useEffect(() => {
    if (talentIds.length === 0) return;
    const fetchFaceFoundations = async () => {
      const { data } = await supabase
        .from("face_pairing_outputs")
        .select(`
          id,
          stored_url,
          pairing:face_pairings!inner(
            digital_talent_id,
            cropped_face_id
          )
        `)
        .eq("status", "completed")
        .eq("is_face_foundation", true)
        .not("stored_url", "is", null);

      if (data) {
        const foundations: FaceFoundation[] = [];
        for (const output of data) {
          const pairing = output.pairing as any;
          if (pairing?.digital_talent_id && talentIds.includes(pairing.digital_talent_id) && output.stored_url) {
            const { data: identityImage } = await supabase
              .from("face_identity_images")
              .select("view")
              .eq("scrape_image_id", pairing.cropped_face_id)
              .maybeSingle();

            foundations.push({
              id: output.id,
              stored_url: output.stored_url,
              view: (identityImage?.view as any) || "unknown",
              digital_talent_id: pairing.digital_talent_id,
            });
          }
        }
        setFaceFoundations(foundations);
      }
    };
    fetchFaceFoundations();
  }, [talentIds]);

  // Fetch existing jobs for this project
  useEffect(() => {
    if (!projectId) return;
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);
    };
    fetchJobs();
  }, [projectId]);

  // Poll for job updates
  useEffect(() => {
    const runningJobs = jobs.filter(j => j.status === "running" || j.status === "pending");
    if (runningJobs.length === 0) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (data) {
        setJobs(data as unknown as FaceApplicationJob[]);
        const stillRunning = data.some(j => j.status === "running" || j.status === "pending");
        if (!stillRunning) {
          setIsGenerating(false);
          const allCompleted = data.every(j => j.status === "completed");
          if (allCompleted) {
            toast({ title: "Generation complete", description: "All faces have been generated." });
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs, projectId, toast]);

  // Auto-describe and start generation for all looks
  const handleStartGeneration = async () => {
    if (looks.length === 0 || talentIds.length === 0) return;
    setIsGenerating(true);

    try {
      // Create jobs for each look
      for (const look of looks) {
        const talentId = look.digital_talent_id || talentIds[0];
        
        // Auto-describe outfits for this look's images
        const outfitDescriptions: Record<string, string> = {};
        
        toast({ title: "Analyzing outfits...", description: `Processing ${look.name}` });
        
        // Describe in parallel
        const results = await Promise.all(
          look.sourceImages.map(async (img) => {
            const response = await supabase.functions.invoke("generate-outfit-description", {
              body: { imageUrl: img.source_url },
            });
            return {
              id: img.id,
              description: response.data?.description || null,
            };
          })
        );
        
        results.forEach(({ id, description }) => {
          if (description) outfitDescriptions[id] = description;
        });

        // Build face matches from foundations
        const faceMatches: Record<string, string> = {};
        look.sourceImages.forEach((img) => {
          const matchingFace = faceFoundations.find(f => f.view === img.view);
          if (matchingFace) {
            faceMatches[img.id] = matchingFace.stored_url;
          } else if (faceFoundations.length > 0) {
            faceMatches[img.id] = faceFoundations[0].stored_url;
          }
        });

        // Create job
        const { data: newJob, error: jobError } = await supabase
          .from("face_application_jobs")
          .insert({
            project_id: projectId,
            look_id: look.id,
            digital_talent_id: talentId,
            attempts_per_view: attemptsPerView,
            total: look.sourceImages.length * attemptsPerView,
            status: "pending",
          })
          .select()
          .single();

        if (jobError) throw jobError;

        // Trigger generation
        await supabase.functions.invoke("generate-face-application", {
          body: {
            jobId: newJob.id,
            outfitDescriptions,
            faceMatches,
          },
        });
      }

      // Refresh jobs
      const { data } = await supabase
        .from("face_application_jobs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (data) setJobs(data as unknown as FaceApplicationJob[]);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsGenerating(false);
    }
  };

  // Calculate totals
  const allSourceImages = looks.flatMap(l => l.sourceImages);
  const totalGenerations = allSourceImages.length * attemptsPerView;
  const totalProgress = jobs.reduce((sum, j) => sum + (j.progress || 0), 0);
  const totalJobItems = jobs.reduce((sum, j) => sum + (j.total || 0), 0);
  const overallProgress = totalJobItems > 0 ? (totalProgress / totalJobItems) * 100 : 0;
  const allJobsCompleted = jobs.length > 0 && jobs.every(j => j.status === "completed");
  const hasRunningJobs = jobs.some(j => j.status === "running" || j.status === "pending");

  return (
    <div className="flex gap-6">
      {/* Main content */}
      <div className="flex-1 space-y-6">
        {/* Pre-generation overview */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {looks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No looks with cropped images found. Complete head crops first.
              </p>
            ) : (
              <div className="space-y-6">
                {/* Settings */}
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
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Total Generations</label>
                    <p className="text-3xl font-bold text-primary">{totalGenerations}</p>
                    <p className="text-xs text-muted-foreground">
                      {looks.length} look{looks.length !== 1 ? "s" : ""} • {allSourceImages.length} view{allSourceImages.length !== 1 ? "s" : ""} × {attemptsPerView} each
                    </p>
                  </div>
                </div>

                {/* Looks grid preview */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Looks to Generate</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {looks.map((look) => (
                      <div key={look.id} className="border rounded-lg p-3 bg-muted/30">
                        <p className="font-medium text-sm mb-2">{look.name}</p>
                        <div className="flex gap-2">
                          {look.sourceImages.map((img) => (
                            <div key={img.id} className="relative">
                              <img
                                src={img.head_cropped_url || img.source_url}
                                alt={img.view}
                                className="w-14 h-14 object-cover rounded border"
                              />
                              <span className="absolute -bottom-1 left-0 right-0 text-[9px] text-center capitalize bg-background/80 rounded-b">
                                {img.view}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress */}
                {hasRunningJobs && (
                  <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-4">
                      <LeapfrogLoader message="" size="sm" />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span>Generating faces...</span>
                          <span className="font-medium">{totalProgress} / {totalJobItems}</span>
                        </div>
                        <Progress value={overallProgress} className="h-2" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleStartGeneration}
                  disabled={looks.length === 0 || isGenerating || faceFoundations.length === 0}
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

                {faceFoundations.length === 0 && (
                  <p className="text-sm text-yellow-600 text-center">
                    No face foundations found. Create them in Talent Face Library first.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Continue Button */}
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={!allJobsCompleted}
            onClick={onContinue}
          >
            Continue to Review
            <ArrowRight className="h-4 w-4 ml-2" />
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
                {talentInfo?.name || "No talent"}
              </p>

              {/* Face foundations preview */}
              {faceFoundations.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Face Foundations</p>
                  <div className="grid grid-cols-3 gap-1">
                    {faceFoundations.slice(0, 6).map((f) => (
                      <img
                        key={f.id}
                        src={f.stored_url}
                        alt={f.view}
                        className="w-full aspect-square object-cover rounded"
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
