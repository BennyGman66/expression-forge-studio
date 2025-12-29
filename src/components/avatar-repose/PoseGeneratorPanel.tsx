import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Sparkles, Download, RefreshCw, Image as ImageIcon, AlertTriangle, FileJson } from "lucide-react";
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

const SLOT_CONFIG: { slot: ImageSlot; label: string }[] = [
  { slot: "A", label: "A: Full Front" },
  { slot: "B", label: "B: Cropped Front" },
  { slot: "C", label: "C: Full Back" },
  { slot: "D", label: "D: Detail" },
];

const VIEW_CONFIG: { view: TalentView; label: string }[] = [
  { view: "front", label: "Front" },
  { view: "back", label: "Back" },
  { view: "detail", label: "Detail" },
  { view: "side", label: "Side" },
];

// Preset configurations
const PRESETS: { name: string; views: TalentView[]; slots: ImageSlot[] }[] = [
  { name: "Front → A+B", views: ["front"], slots: ["A", "B"] },
  { name: "Back → C", views: ["back"], slots: ["C"] },
  { name: "Detail → D", views: ["detail"], slots: ["D"] },
  { name: "All Valid", views: ["front", "back", "detail", "side"], slots: ["A", "B", "C", "D"] },
];

interface ClayImageWithMeta extends ClayImage {
  product_images?: {
    slot: string;
    products: {
      brand_id: string;
      gender: string;
      product_type: string;
    };
  };
}

interface TalentLook {
  id: string;
  talent_id: string;
  name: string;
  product_type: 'tops' | 'bottoms' | null;
  created_at: string;
}

export function PoseGeneratorPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [talentLooks, setTalentLooks] = useState<TalentLook[]>([]);
  const [talentImages, setTalentImages] = useState<TalentImage[]>([]);
  const [allClayImages, setAllClayImages] = useState<ClayImageWithMeta[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);

  // Form state
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedSlots, setSelectedSlots] = useState<ImageSlot[]>([]);
  const [selectedTalent, setSelectedTalent] = useState("");
  const [selectedLookId, setSelectedLookId] = useState("");
  const [selectedViews, setSelectedViews] = useState<TalentView[]>([]);
  const [randomCount, setRandomCount] = useState(5);
  const [attemptsPerPose, setAttemptsPerPose] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get selected look
  const selectedLook = talentLooks.find(l => l.id === selectedLookId);

  // Compute available views for selected talent
  const availableViews = useMemo(() => {
    return VIEW_CONFIG.map(vc => ({
      ...vc,
      available: talentImages.some(img => img.view === vc.view),
      imageCount: talentImages.filter(img => img.view === vc.view).length,
    }));
  }, [talentImages]);

  // Compute clay image counts per slot (filtered by look's product_type)
  const clayImagesBySlot = useMemo(() => {
    const result: Record<ImageSlot, ClayImageWithMeta[]> = { A: [], B: [], C: [], D: [] };
    
    // Map look product_type to product's product_type
    const lookProductType = selectedLook?.product_type;
    const productTypeFilter = lookProductType === 'tops' ? 'tops' : lookProductType === 'bottoms' ? 'trousers' : null;
    
    allClayImages.forEach(clay => {
      const slot = clay.product_images?.slot as ImageSlot;
      if (slot && result[slot]) {
        // Gender filter
        if (selectedGender !== "all" && clay.product_images?.products?.gender !== selectedGender) {
          return;
        }
        // Product type filter based on look
        if (productTypeFilter && clay.product_images?.products?.product_type !== productTypeFilter) {
          return;
        }
        result[slot].push(clay);
      }
    });
    
    return result;
  }, [allClayImages, selectedGender, selectedLook]);

  // Compute pairing breakdown
  const pairingBreakdown = useMemo(() => {
    const breakdown: {
      view: TalentView;
      viewLabel: string;
      refCount: number;
      slots: { slot: ImageSlot; poseCount: number }[];
    }[] = [];

    selectedViews.forEach(view => {
      const refCount = talentImages.filter(img => img.view === view).length;
      if (refCount === 0) return;

      const slots = selectedSlots.map(slot => ({
        slot,
        poseCount: Math.min(randomCount, clayImagesBySlot[slot].length),
      })).filter(s => s.poseCount > 0);

      if (slots.length > 0) {
        breakdown.push({
          view,
          viewLabel: VIEW_CONFIG.find(v => v.view === view)?.label || view,
          refCount,
          slots,
        });
      }
    });

    return breakdown;
  }, [selectedViews, selectedSlots, talentImages, randomCount, clayImagesBySlot]);

  // Compute total outputs
  const totalOutputs = useMemo(() => {
    let total = 0;
    pairingBreakdown.forEach(item => {
      item.slots.forEach(slot => {
        total += item.refCount * slot.poseCount * attemptsPerPose;
      });
    });
    return total;
  }, [pairingBreakdown, attemptsPerPose]);

  // Warnings for missing views
  const warnings = useMemo(() => {
    const msgs: string[] = [];
    selectedViews.forEach(view => {
      const refCount = talentImages.filter(img => img.view === view).length;
      if (refCount === 0) {
        msgs.push(`No ${view} images for selected talent - will be skipped`);
      }
    });
    selectedSlots.forEach(slot => {
      if (clayImagesBySlot[slot].length === 0) {
        msgs.push(`No poses available for slot ${slot} - will be skipped`);
      }
    });
    return msgs;
  }, [selectedViews, selectedSlots, talentImages, clayImagesBySlot]);

  useEffect(() => {
    fetchData();

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
  }, [selectedBrand]);

  useEffect(() => {
    if (selectedTalent) {
      fetchTalentLooks();
      setSelectedLookId("");
      setTalentImages([]);
    }
  }, [selectedTalent]);

  useEffect(() => {
    if (selectedLookId) {
      fetchTalentImages();
    }
  }, [selectedLookId]);

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
      .select("*, product_images!inner(slot, products!inner(brand_id, gender, product_type))")
      .eq("product_images.products.brand_id", selectedBrand);

    if (data) {
      setAllClayImages(data as unknown as ClayImageWithMeta[]);
    }
  };

  const fetchTalentLooks = async () => {
    const { data } = await supabase
      .from("talent_looks")
      .select("*")
      .eq("talent_id", selectedTalent)
      .order("created_at", { ascending: true });

    if (data) {
      setTalentLooks(data as TalentLook[]);
      // Auto-select first look
      if (data.length > 0) {
        setSelectedLookId(data[0].id);
      }
    }
  };

  const fetchTalentImages = async () => {
    const { data } = await supabase
      .from("talent_images")
      .select("*")
      .eq("look_id", selectedLookId);

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

  const toggleSlot = (slot: ImageSlot) => {
    setSelectedSlots(prev => 
      prev.includes(slot) ? prev.filter(s => s !== slot) : [...prev, slot]
    );
  };

  const toggleView = (view: TalentView) => {
    setSelectedViews(prev => 
      prev.includes(view) ? prev.filter(v => v !== view) : [...prev, view]
    );
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const validViews = preset.views.filter(v => 
      talentImages.some(img => img.view === v)
    );
    const validSlots = preset.slots.filter(s => 
      clayImagesBySlot[s].length > 0
    );
    setSelectedViews(validViews);
    setSelectedSlots(validSlots);
    toast.success(`Applied "${preset.name}" preset`);
  };

  const handleGenerate = async () => {
    if (!selectedBrand || !selectedTalent) {
      toast.error("Please select a brand and talent");
      return;
    }

    if (selectedViews.length === 0 || selectedSlots.length === 0) {
      toast.error("Please select at least one view and one slot");
      return;
    }

    if (totalOutputs === 0) {
      toast.error("No valid pairings to generate");
      return;
    }

    setIsGenerating(true);

    try {
      // Build pairings array
      const pairings: {
        view: TalentView;
        talentImageUrl: string;
        talentImageId: string;
        slots: ImageSlot[];
      }[] = [];

      selectedViews.forEach(view => {
        const viewImages = talentImages.filter(img => img.view === view);
        viewImages.forEach(img => {
          pairings.push({
            view,
            talentImageUrl: img.stored_url,
            talentImageId: img.id,
            slots: selectedSlots.filter(slot => clayImagesBySlot[slot].length > 0),
          });
        });
      });

      const { data, error } = await supabase.functions.invoke("generate-poses", {
        body: {
          brandId: selectedBrand,
          talentId: selectedTalent,
          pairings,
          gender: selectedGender,
          randomCount,
          attemptsPerPose,
          bulkMode: true,
        },
      });

      if (error) throw error;

      toast.success(`Started generating ${totalOutputs} images`);
      
      if (data?.jobId) {
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

  const handleDownloadAll = () => {
    generations.forEach((gen, idx) => {
      const link = document.createElement("a");
      link.href = gen.stored_url;
      link.download = `generation-${idx + 1}.png`;
      link.click();
    });
    toast.success(`Downloading ${generations.length} images`);
  };

  const handleExportManifest = () => {
    const manifest = {
      jobId: currentJob?.id,
      generatedAt: new Date().toISOString(),
      settings: {
        brand: brands.find(b => b.id === selectedBrand)?.name,
        talent: talents.find(t => t.id === selectedTalent)?.name,
        views: selectedViews,
        slots: selectedSlots,
        randomCount,
        attemptsPerPose,
      },
      totalOutputs: generations.length,
      generations: generations.map(gen => ({
        id: gen.id,
        poseId: gen.pose_clay_image_id,
        attempt: gen.attempt_index,
        url: gen.stored_url,
      })),
    };
    
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `job-manifest-${currentJob?.id || 'export'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Manifest exported");
  };

  // Group generations by pose for display
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
        
        {/* Row 1: Brand, Gender, Talent, Look */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
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
            <Label>Gender Filter</Label>
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
            <Label>Look</Label>
            <Select 
              value={selectedLookId} 
              onValueChange={setSelectedLookId}
              disabled={!selectedTalent || talentLooks.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={talentLooks.length === 0 ? "No looks" : "Select look"} />
              </SelectTrigger>
              <SelectContent>
                {talentLooks.map((look) => (
                  <SelectItem key={look.id} value={look.id}>
                    {look.name} {look.product_type && <span className="text-muted-foreground">({look.product_type})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLook?.product_type && (
              <p className="text-xs text-muted-foreground">
                Filtering poses to: <Badge variant="secondary" className="text-xs">{selectedLook.product_type}</Badge>
              </p>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Row 2: Multi-select Views and Slots */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Talent Views */}
          <div className="space-y-3">
            <Label>Talent Views (multi-select)</Label>
            <div className="grid grid-cols-2 gap-2">
              {availableViews.map(({ view, label, available, imageCount }) => (
                <div
                  key={view}
                  className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                    !available ? "opacity-50 cursor-not-allowed bg-muted" : 
                    selectedViews.includes(view) ? "bg-primary/10 border-primary" : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    id={`view-${view}`}
                    checked={selectedViews.includes(view)}
                    onCheckedChange={() => available && toggleView(view)}
                    disabled={!available}
                  />
                  <label
                    htmlFor={`view-${view}`}
                    className={`flex-1 text-sm cursor-pointer ${!available && "cursor-not-allowed"}`}
                  >
                    {label}
                    {available && (
                      <span className="text-muted-foreground ml-1">({imageCount})</span>
                    )}
                    {!available && (
                      <span className="text-muted-foreground ml-1">(none)</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Pose Slot Families */}
          <div className="space-y-3">
            <Label>Pose Slot Families (multi-select)</Label>
            <div className="grid grid-cols-2 gap-2">
              {SLOT_CONFIG.map(({ slot, label }) => {
                const count = clayImagesBySlot[slot].length;
                const available = count > 0;
                return (
                  <div
                    key={slot}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
                      !available ? "opacity-50 cursor-not-allowed bg-muted" : 
                      selectedSlots.includes(slot) ? "bg-primary/10 border-primary" : "hover:bg-muted"
                    }`}
                  >
                    <Checkbox
                      id={`slot-${slot}`}
                      checked={selectedSlots.includes(slot)}
                      onCheckedChange={() => available && toggleSlot(slot)}
                      disabled={!available}
                    />
                    <label
                      htmlFor={`slot-${slot}`}
                      className={`flex-1 text-sm cursor-pointer ${!available && "cursor-not-allowed"}`}
                    >
                      {label}
                      <span className="text-muted-foreground ml-1">({count})</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pairing Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Label className="w-full mb-1">Pairing Presets</Label>
          {PRESETS.map(preset => (
            <Button
              key={preset.name}
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset)}
              disabled={!selectedTalent || !selectedBrand}
            >
              {preset.name}
            </Button>
          ))}
        </div>

        <Separator className="my-4" />

        {/* Row 3: Random count, Attempts */}
        <div className="grid md:grid-cols-4 gap-4 mb-4">
          <div className="space-y-2">
            <Label>Random Poses (per slot)</Label>
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

          <div className="space-y-2">
            <Label>Attempts per pose</Label>
            <Select
              value={String(attemptsPerPose)}
              onValueChange={(v) => setAttemptsPerPose(Number(v))}
            >
              <SelectTrigger>
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

          <div className="col-span-2" />
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          </div>
        )}

        {/* Pairing Preview */}
        {pairingBreakdown.length > 0 && (
          <Card className="p-4 bg-muted/50 mb-4">
            <p className="text-sm font-medium mb-2">Pairing Preview</p>
            <div className="space-y-1 text-sm">
              {pairingBreakdown.map(item => (
                <div key={item.view} className="flex items-center gap-2">
                  <Badge variant="outline">{item.viewLabel}</Badge>
                  <span className="text-muted-foreground">
                    {item.refCount} ref{item.refCount > 1 ? 's' : ''} × Slots ({item.slots.map(s => s.slot).join(', ')}) × {item.slots[0]?.poseCount || 0} poses × {attemptsPerPose} attempts
                  </span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Outputs:</span>
              <Badge variant="secondary" className="text-lg">{totalOutputs}</Badge>
            </div>
          </Card>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-end gap-4">
          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || totalOutputs === 0}
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {totalOutputs} Images
              </>
            )}
          </Button>
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

      {/* Preview Panels */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Selected Talent Images */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">
            Talent References ({talentImages.length})
          </p>
          <div className="grid grid-cols-4 gap-2">
            {talentImages.map((img) => (
              <div
                key={img.id}
                className={`aspect-[3/4] rounded-lg overflow-hidden relative ${
                  selectedViews.includes(img.view as TalentView) 
                    ? "ring-2 ring-primary" 
                    : "opacity-50"
                }`}
              >
                <img
                  src={img.stored_url}
                  alt={img.view}
                  className="w-full h-full object-cover"
                />
                <Badge 
                  className="absolute bottom-1 left-1 text-xs"
                  variant={selectedViews.includes(img.view as TalentView) ? "default" : "outline"}
                >
                  {img.view}
                </Badge>
              </div>
            ))}
            {talentImages.length === 0 && (
              <div className="col-span-4 h-32 flex items-center justify-center text-muted-foreground">
                <ImageIcon className="w-8 h-8" />
              </div>
            )}
          </div>
        </Card>

        {/* Available Clay Poses by Slot */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">
            Available Poses by Slot
          </p>
          <ScrollArea className="h-64">
            <div className="space-y-3">
              {SLOT_CONFIG.map(({ slot, label }) => {
                const poses = clayImagesBySlot[slot];
                const isSelected = selectedSlots.includes(slot);
                return (
                  <div 
                    key={slot}
                    className={`p-2 rounded-lg border ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{label}</span>
                      <Badge variant="outline">{poses.length}</Badge>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {poses.slice(0, 6).map((clay) => (
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
                      {poses.length > 6 && (
                        <div className="aspect-[3/4] rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          +{poses.length - 6}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </Card>
      </div>

      {/* Generated Results */}
      {Object.keys(generationsByPose).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Generated Results ({generations.length})</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportManifest}>
                <FileJson className="w-4 h-4 mr-2" />
                Export Manifest
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                <Download className="w-4 h-4 mr-2" />
                Download All
              </Button>
            </div>
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
