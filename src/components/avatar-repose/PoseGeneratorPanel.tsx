import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Download, RefreshCw, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type {
  Brand,
  Talent,
  TalentImage,
  ClayImage,
  GenerationJob,
  Generation,
  ImageSlot,
  TalentView,
} from "@/types/avatar-repose";

const RANDOM_COUNTS = [3, 5, 10, 20];
const ATTEMPTS_OPTIONS = [1, 3, 5];

export function PoseGeneratorPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [talentImages, setTalentImages] = useState<TalentImage[]>([]);
  const [clayImages, setClayImages] = useState<ClayImage[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);

  // Form state
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedSlot, setSelectedSlot] = useState<ImageSlot>("A");
  const [selectedTalent, setSelectedTalent] = useState("");
  const [selectedView, setSelectedView] = useState<TalentView>("front");
  const [randomCount, setRandomCount] = useState(5);
  const [attemptsPerPose, setAttemptsPerPose] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchData();

    // Subscribe to job updates
    const channel = supabase
      .channel("generation-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setCurrentJob(payload.new as GenerationJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      fetchClayImages();
    }
  }, [selectedBrand, selectedGender, selectedSlot]);

  useEffect(() => {
    if (selectedTalent) {
      fetchTalentImages();
    }
  }, [selectedTalent]);

  const fetchData = async () => {
    const [brandsRes, talentsRes] = await Promise.all([
      supabase.from("brands").select("*").order("created_at", { ascending: false }),
      supabase.from("talents").select("*").order("created_at", { ascending: false }),
    ]);

    if (brandsRes.data) setBrands(brandsRes.data);
    if (talentsRes.data) setTalents(talentsRes.data);
  };

  const fetchClayImages = async () => {
    const { data } = await supabase
      .from("clay_images")
      .select("*, product_images!inner(slot, products!inner(brand_id, gender))")
      .eq("product_images.products.brand_id", selectedBrand)
      .eq("product_images.slot", selectedSlot);

    if (data) {
      let filtered = data;
      if (selectedGender !== "all") {
        filtered = data.filter(
          (c: any) => c.product_images.products.gender === selectedGender
        );
      }
      setClayImages(filtered as unknown as ClayImage[]);
    }
  };

  const fetchTalentImages = async () => {
    const { data } = await supabase
      .from("talent_images")
      .select("*")
      .eq("talent_id", selectedTalent);

    if (data) setTalentImages(data);
  };

  const fetchGenerations = async (jobId: string) => {
    const { data } = await supabase
      .from("generations")
      .select("*, clay_images(*)")
      .eq("generation_job_id", jobId)
      .order("created_at", { ascending: true });

    if (data) setGenerations(data as unknown as Generation[]);
  };

  const handleGenerate = async () => {
    if (!selectedBrand || !selectedTalent) {
      toast.error("Please select a brand and talent");
      return;
    }

    const talentImage = talentImages.find((img) => img.view === selectedView);
    if (!talentImage) {
      toast.error(`No ${selectedView} image for this talent`);
      return;
    }

    if (clayImages.length === 0) {
      toast.error("No clay images available for this selection");
      return;
    }

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-poses", {
        body: {
          brandId: selectedBrand,
          talentId: selectedTalent,
          talentImageUrl: talentImage.stored_url,
          view: selectedView,
          slot: selectedSlot,
          gender: selectedGender,
          randomCount,
          attemptsPerPose,
        },
      });

      if (error) throw error;

      toast.success(`Started generating ${randomCount * attemptsPerPose} images`);
      
      if (data?.jobId) {
        // Poll for generations
        const interval = setInterval(async () => {
          await fetchGenerations(data.jobId);
          const { data: job } = await supabase
            .from("generation_jobs")
            .select("*")
            .eq("id", data.jobId)
            .single();

          if (job && (job.status === "completed" || job.status === "failed")) {
            clearInterval(interval);
            setIsGenerating(false);
          }
        }, 2000);
      }
    } catch (err) {
      console.error("Generation error:", err);
      toast.error("Failed to start generation");
      setIsGenerating(false);
    }
  };

  const getTalentImageForView = () => {
    return talentImages.find((img) => img.view === selectedView);
  };

  // Display order: A (Full Front), B (Cropped Front), D (Detail), C (Full Back)
  const slots: ImageSlot[] = ["A", "B", "D", "C"];
  const SLOT_LABELS: Record<string, string> = {
    A: "Full Front",
    B: "Cropped Front",
    D: "Detail",
    C: "Full Back",
  };
  const views: TalentView[] = ["front", "back", "detail", "side"];

  // Group generations by pose
  const generationsByPose = generations.reduce((acc, gen) => {
    if (!acc[gen.pose_clay_image_id]) {
      acc[gen.pose_clay_image_id] = [];
    }
    acc[gen.pose_clay_image_id].push(gen);
    return acc;
  }, {} as Record<string, Generation[]>);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controls */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Generate Pose Transfers</h3>
        
        <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label>Brand</Label>
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger>
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={selectedGender} onValueChange={setSelectedGender}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="men">Men</SelectItem>
                <SelectItem value="women">Women</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Slot</Label>
            <Select value={selectedSlot} onValueChange={(v) => setSelectedSlot(v as ImageSlot)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slots.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}: {SLOT_LABELS[slot]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Talent</Label>
            <Select value={selectedTalent} onValueChange={setSelectedTalent}>
              <SelectTrigger>
                <SelectValue placeholder="Select talent" />
              </SelectTrigger>
              <SelectContent>
                {talents.map((talent) => (
                  <SelectItem key={talent.id} value={talent.id}>
                    {talent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>View</Label>
            <Select value={selectedView} onValueChange={(v) => setSelectedView(v as TalentView)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {views.map((view) => (
                  <SelectItem key={view} value={view} className="capitalize">
                    {view}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Random Poses</Label>
            <Select value={String(randomCount)} onValueChange={(v) => setRandomCount(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANDOM_COUNTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div className="space-y-2">
            <Label>Attempts per pose</Label>
            <Select
              value={String(attemptsPerPose)}
              onValueChange={(v) => setAttemptsPerPose(Number(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTEMPTS_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <div className="text-right">
            <p className="text-sm text-muted-foreground mb-1">
              Total outputs: {randomCount * attemptsPerPose}
            </p>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>

        {currentJob && currentJob.status === "running" && (
          <div className="mt-4">
            <Progress
              value={(currentJob.progress / (currentJob.total || 1)) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {currentJob.progress} / {currentJob.total} generated
            </p>
          </div>
        )}
      </Card>

      {/* Preview */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Talent Preview */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">Talent Reference</p>
          <div className="aspect-[3/4] rounded-lg bg-muted overflow-hidden">
            {getTalentImageForView() ? (
              <img
                src={getTalentImageForView()!.stored_url}
                alt="Talent"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-8 h-8" />
              </div>
            )}
          </div>
        </Card>

        {/* Clay Poses Preview */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">
            Available Poses ({clayImages.length})
          </p>
          <div className="grid grid-cols-4 gap-2 max-h-80 overflow-y-auto">
            {clayImages.slice(0, 16).map((clay) => (
              <div
                key={clay.id}
                className="aspect-[3/4] rounded bg-muted overflow-hidden"
              >
                <img
                  src={clay.stored_url}
                  alt="Pose"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Generated Results */}
      {Object.keys(generationsByPose).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Generated Results</h3>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          </div>

          <div className="grid gap-6">
            {Object.entries(generationsByPose).map(([poseId, gens]) => (
              <Card key={poseId} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline">Pose</Badge>
                  <span className="text-sm text-muted-foreground">
                    {gens.length} attempts
                  </span>
                  <div className="flex-1" />
                  <Button variant="ghost" size="sm">
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Rerun
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {gens.map((gen) => (
                    <div
                      key={gen.id}
                      className="aspect-[3/4] rounded-lg bg-muted overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all"
                    >
                      <img
                        src={gen.stored_url}
                        alt={`Attempt ${gen.attempt_index}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
