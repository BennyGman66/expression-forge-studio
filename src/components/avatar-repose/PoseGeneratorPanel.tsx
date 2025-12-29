import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles, Download, RefreshCw, Image as ImageIcon, AlertTriangle, FileJson, Zap, Info } from "lucide-react";
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

interface SelectedTalentLook {
  talentId: string;
  talentName: string;
  talentGender: string | null;
  lookId: string;
  lookName: string;
  productType: 'tops' | 'bottoms' | null;
  availableViews: TalentView[];
}

interface SmartPairing {
  talentLookKey: string;
  talentName: string;
  lookName: string;
  productType: 'tops' | 'bottoms' | null;
  view: TalentView;
  talentImageId: string;
  talentImageUrl: string;
  slots: ImageSlot[];
  slotPoseCounts: { slot: ImageSlot; count: number }[];
}

export function PoseGeneratorPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [talents, setTalents] = useState<Talent[]>([]);
  const [allTalentLooks, setAllTalentLooks] = useState<TalentLook[]>([]);
  const [allTalentImages, setAllTalentImages] = useState<TalentImage[]>([]);
  const [allClayImages, setAllClayImages] = useState<ClayImageWithMeta[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);

  // Form state
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedGender, setSelectedGender] = useState("all");
  const [selectedTalentLooks, setSelectedTalentLooks] = useState<SelectedTalentLook[]>([]);
  const [smartPairingMode, setSmartPairingMode] = useState(true);
  
  // Manual mode state (when smart pairing is off)
  const [selectedSlots, setSelectedSlots] = useState<ImageSlot[]>([]);
  const [selectedViews, setSelectedViews] = useState<TalentView[]>([]);
  
  const [randomCount, setRandomCount] = useState(5);
  const [attemptsPerPose, setAttemptsPerPose] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load all looks and images for all talents
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
    if (talents.length > 0) {
      fetchAllTalentData();
    }
  }, [talents]);

  const fetchData = async () => {
    const [brandsRes, talentsRes] = await Promise.all([
      supabase.from("brands").select("*").order("created_at", { ascending: false }),
      supabase.from("talents").select("*").order("created_at", { ascending: false }),
    ]);

    if (brandsRes.data) setBrands(brandsRes.data);
    if (talentsRes.data) setTalents(talentsRes.data);
  };

  const fetchAllTalentData = async () => {
    const [looksRes, imagesRes] = await Promise.all([
      supabase.from("talent_looks").select("*").order("created_at", { ascending: true }),
      supabase.from("talent_images").select("*"),
    ]);

    if (looksRes.data) setAllTalentLooks(looksRes.data as TalentLook[]);
    if (imagesRes.data) setAllTalentImages(imagesRes.data);
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

  const fetchGenerations = async (jobId: string) => {
    const { data } = await supabase
      .from("generations")
      .select("*, clay_images(*)")
      .eq("generation_job_id", jobId)
      .order("created_at", { ascending: true });

    if (data) setGenerations(data as unknown as Generation[]);
  };

  // Build talent + look combinations with available views
  const talentLookOptions = useMemo(() => {
    return talents.flatMap(talent => {
      const looks = allTalentLooks.filter(l => l.talent_id === talent.id);
      return looks.map(look => {
        const lookImages = allTalentImages.filter(img => img.look_id === look.id);
        const availableViews = VIEW_CONFIG
          .filter(vc => lookImages.some(img => img.view === vc.view))
          .map(vc => vc.view);
        
        return {
          talentId: talent.id,
          talentName: talent.name,
          talentGender: talent.gender,
          lookId: look.id,
          lookName: look.name,
          productType: look.product_type,
          availableViews,
        } as SelectedTalentLook;
      });
    });
  }, [talents, allTalentLooks, allTalentImages]);

  // Get clay images filtered by gender and product type
  const getClayImagesBySlotForProductType = useCallback((productType: 'tops' | 'bottoms' | null) => {
    const result: Record<ImageSlot, ClayImageWithMeta[]> = { A: [], B: [], C: [], D: [] };
    const productTypeFilter = productType === 'tops' ? 'tops' : productType === 'bottoms' ? 'trousers' : null;
    
    allClayImages.forEach(clay => {
      const slot = clay.product_images?.slot as ImageSlot;
      if (slot && result[slot]) {
        // Gender filter
        if (selectedGender !== "all" && clay.product_images?.products?.gender !== selectedGender) {
          return;
        }
        // Product type filter
        if (productTypeFilter && clay.product_images?.products?.product_type !== productTypeFilter) {
          return;
        }
        result[slot].push(clay);
      }
    });
    
    return result;
  }, [allClayImages, selectedGender]);

  // Toggle talent+look selection
  const toggleTalentLook = (option: SelectedTalentLook) => {
    const key = `${option.talentId}_${option.lookId}`;
    setSelectedTalentLooks(prev => {
      const exists = prev.some(s => `${s.talentId}_${s.lookId}` === key);
      if (exists) {
        return prev.filter(s => `${s.talentId}_${s.lookId}` !== key);
      }
      return [...prev, option];
    });
  };

  // Compute smart pairings based on rules
  const smartPairings = useMemo((): SmartPairing[] => {
    if (!smartPairingMode || selectedTalentLooks.length === 0) return [];

    const pairings: SmartPairing[] = [];

    for (const tl of selectedTalentLooks) {
      const lookImages = allTalentImages.filter(img => img.look_id === tl.lookId);
      const hasFront = lookImages.some(img => img.view === 'front');
      const hasDetail = lookImages.some(img => img.view === 'detail');
      const hasBack = lookImages.some(img => img.view === 'back');
      
      const clayBySlot = getClayImagesBySlotForProductType(tl.productType);
      const key = `${tl.talentId}_${tl.lookId}`;

      // FRONT → A + B
      if (hasFront) {
        const frontImages = lookImages.filter(img => img.view === 'front');
        frontImages.forEach(img => {
          const slots: ImageSlot[] = ['A', 'B'].filter(s => clayBySlot[s as ImageSlot].length > 0) as ImageSlot[];
          if (slots.length > 0) {
            pairings.push({
              talentLookKey: key,
              talentName: tl.talentName,
              lookName: tl.lookName,
              productType: tl.productType,
              view: 'front',
              talentImageId: img.id,
              talentImageUrl: img.stored_url,
              slots,
              slotPoseCounts: slots.map(s => ({ slot: s, count: Math.min(randomCount, clayBySlot[s].length) })),
            });
          }
        });
      }

      // DETAIL → D (if exists) OR FRONT → D (fallback)
      if (hasDetail) {
        const detailImages = lookImages.filter(img => img.view === 'detail');
        detailImages.forEach(img => {
          if (clayBySlot.D.length > 0) {
            pairings.push({
              talentLookKey: key,
              talentName: tl.talentName,
              lookName: tl.lookName,
              productType: tl.productType,
              view: 'detail',
              talentImageId: img.id,
              talentImageUrl: img.stored_url,
              slots: ['D'],
              slotPoseCounts: [{ slot: 'D', count: Math.min(randomCount, clayBySlot.D.length) }],
            });
          }
        });
      } else if (hasFront) {
        // Fallback: use FRONT for D
        const frontImages = lookImages.filter(img => img.view === 'front');
        frontImages.forEach(img => {
          if (clayBySlot.D.length > 0) {
            pairings.push({
              talentLookKey: key,
              talentName: tl.talentName,
              lookName: tl.lookName,
              productType: tl.productType,
              view: 'front',
              talentImageId: img.id,
              talentImageUrl: img.stored_url,
              slots: ['D'],
              slotPoseCounts: [{ slot: 'D', count: Math.min(randomCount, clayBySlot.D.length) }],
            });
          }
        });
      }

      // BACK → C
      if (hasBack) {
        const backImages = lookImages.filter(img => img.view === 'back');
        backImages.forEach(img => {
          if (clayBySlot.C.length > 0) {
            pairings.push({
              talentLookKey: key,
              talentName: tl.talentName,
              lookName: tl.lookName,
              productType: tl.productType,
              view: 'back',
              talentImageId: img.id,
              talentImageUrl: img.stored_url,
              slots: ['C'],
              slotPoseCounts: [{ slot: 'C', count: Math.min(randomCount, clayBySlot.C.length) }],
            });
          }
        });
      }
    }

    return pairings;
  }, [smartPairingMode, selectedTalentLooks, allTalentImages, getClayImagesBySlotForProductType, randomCount]);

  // Group pairings by talent+look for display
  const pairingsByTalentLook = useMemo(() => {
    const grouped: Record<string, { talentName: string; lookName: string; productType: string | null; pairings: SmartPairing[]; subtotal: number }> = {};
    
    for (const p of smartPairings) {
      if (!grouped[p.talentLookKey]) {
        grouped[p.talentLookKey] = {
          talentName: p.talentName,
          lookName: p.lookName,
          productType: p.productType,
          pairings: [],
          subtotal: 0,
        };
      }
      grouped[p.talentLookKey].pairings.push(p);
      p.slotPoseCounts.forEach(spc => {
        grouped[p.talentLookKey].subtotal += spc.count * attemptsPerPose;
      });
    }
    
    return grouped;
  }, [smartPairings, attemptsPerPose]);

  // Total outputs
  const totalOutputs = useMemo(() => {
    if (smartPairingMode) {
      return Object.values(pairingsByTalentLook).reduce((sum, g) => sum + g.subtotal, 0);
    }
    // Manual mode calculation would go here
    return 0;
  }, [smartPairingMode, pairingsByTalentLook]);

  // Warnings - enhanced to show why 0 images might be generated
  const warnings = useMemo(() => {
    const msgs: string[] = [];
    
    // Warning: No brand selected
    if (!selectedBrand) {
      msgs.push("Select a brand to load available clay poses");
      return msgs;
    }
    
    // Warning: No clay images for selected brand
    if (allClayImages.length === 0) {
      msgs.push("No clay poses found for this brand. Generate clay images first.");
      return msgs;
    }
    
    // Warning: No talent-looks selected
    if (selectedTalentLooks.length === 0) {
      msgs.push("Select at least one talent-look to generate images");
      return msgs;
    }
    
    if (smartPairingMode) {
      selectedTalentLooks.forEach(tl => {
        const lookImages = allTalentImages.filter(img => img.look_id === tl.lookId);
        
        // Warning: No images uploaded for look
        if (lookImages.length === 0) {
          msgs.push(`${tl.talentName} - ${tl.lookName}: No images uploaded`);
          return;
        }
        
        // Warning: Missing product type
        if (!tl.productType) {
          msgs.push(`${tl.talentName} - ${tl.lookName}: Product type not set. Go to Talent Library to set it.`);
          return;
        }
        
        // Warning: No matching clay poses for product type
        const clayBySlot = getClayImagesBySlotForProductType(tl.productType);
        const totalClayPoses = Object.values(clayBySlot).flat().length;
        if (totalClayPoses === 0) {
          const typeLabel = tl.productType === 'bottoms' ? 'bottoms/trousers' : tl.productType;
          msgs.push(`${tl.talentName} - ${tl.lookName}: No clay poses for "${typeLabel}" product type`);
          return;
        }
        
        // Warning: Missing front or back views
        const hasFront = lookImages.some(img => img.view === 'front');
        const hasBack = lookImages.some(img => img.view === 'back');
        if (!hasFront && !hasBack) {
          msgs.push(`${tl.talentName} - ${tl.lookName}: No front or back shots`);
        }
      });
    }
    return msgs;
  }, [smartPairingMode, selectedTalentLooks, allTalentImages, selectedBrand, allClayImages, getClayImagesBySlotForProductType]);

  const handleGenerate = async () => {
    if (!selectedBrand) {
      toast.error("Please select a brand");
      return;
    }

    if (selectedTalentLooks.length === 0) {
      toast.error("Please select at least one talent + look");
      return;
    }

    if (totalOutputs === 0) {
      toast.error("No valid pairings to generate");
      return;
    }

    setIsGenerating(true);

    try {
      // Build pairings for API
      const apiPairings = smartPairings.map(p => ({
        view: p.view,
        talentImageUrl: p.talentImageUrl,
        talentImageId: p.talentImageId,
        slots: p.slots,
        productType: p.productType,
      }));

      const { data, error } = await supabase.functions.invoke("generate-poses", {
        body: {
          brandId: selectedBrand,
          talentId: selectedTalentLooks[0].talentId, // Primary talent for job record
          pairings: apiPairings,
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
        talents: selectedTalentLooks.map(tl => `${tl.talentName} - ${tl.lookName}`),
        randomCount,
        attemptsPerPose,
        smartPairingMode,
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
        
        {/* Row 1: Brand, Gender */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
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
            <Label>Pairing Mode</Label>
            <div className="flex items-center gap-3 h-10">
              <Switch
                checked={smartPairingMode}
                onCheckedChange={setSmartPairingMode}
              />
              <span className="text-sm flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-primary" />
                Smart Auto-Pairing
              </span>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Talent + Look Selection */}
        <div className="mb-6">
          <Label className="mb-3 block">Select Talents & Looks (multi-select)</Label>
          <ScrollArea className="h-64 border rounded-lg p-3">
            <div className="space-y-2">
              {talentLookOptions.map((option) => {
                const key = `${option.talentId}_${option.lookId}`;
                const isSelected = selectedTalentLooks.some(s => `${s.talentId}_${s.lookId}` === key);
                const hasViews = option.availableViews.length > 0;
                
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                      !hasViews ? "opacity-50 bg-muted" :
                      isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted"
                    }`}
                    onClick={() => hasViews && toggleTalentLook(option)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!hasViews}
                      onCheckedChange={() => hasViews && toggleTalentLook(option)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{option.talentName}</span>
                        <span className="text-muted-foreground">-</span>
                        <span>{option.lookName}</span>
                        {option.productType && (
                          <Badge variant="secondary" className="text-xs">
                            {option.productType}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-1">
                        {VIEW_CONFIG.map(vc => {
                          const hasView = option.availableViews.includes(vc.view);
                          return (
                            <Badge
                              key={vc.view}
                              variant={hasView ? "outline" : "secondary"}
                              className={`text-xs ${!hasView && "opacity-40"}`}
                            >
                              {hasView ? "✓" : "✗"} {vc.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
              {talentLookOptions.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No talents or looks found. Add them in the Talent Library.
                </div>
              )}
            </div>
          </ScrollArea>
          {selectedTalentLooks.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              {selectedTalentLooks.length} talent-look{selectedTalentLooks.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Smart Pairing Rules Info */}
        {smartPairingMode && (
          <Card className="p-4 bg-muted/50 mb-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Smart Pairing Rules</p>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>• <strong>FRONT</strong> → A (Full Front) + B (Cropped Front)</li>
                  <li>• <strong>FRONT</strong> → D (Detail) — <em>only if no DETAIL shot exists</em></li>
                  <li>• <strong>DETAIL</strong> → D (Detail) — <em>overrides FRONT for D</em></li>
                  <li>• <strong>BACK</strong> → C (Full Back)</li>
                  <li>• Clay poses filtered by look's product type (tops/bottoms)</li>
                </ul>
              </div>
            </div>
          </Card>
        )}

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

        {/* Pairing Preview (Smart Mode) */}
        {smartPairingMode && Object.keys(pairingsByTalentLook).length > 0 && (
          <Card className="p-4 bg-muted/50 mb-4">
            <p className="text-sm font-medium mb-3">Pairing Preview</p>
            <div className="space-y-4">
              {Object.entries(pairingsByTalentLook).map(([key, group]) => (
                <div key={key} className="border-b pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{group.talentName}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>{group.lookName}</span>
                    {group.productType && (
                      <Badge variant="secondary" className="text-xs">{group.productType}</Badge>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground ml-2">
                    {group.pairings.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{p.view.toUpperCase()}</Badge>
                        <span>→</span>
                        <span>{p.slots.join(' + ')}</span>
                        <span className="text-xs">
                          ({p.slotPoseCounts.map(spc => `${spc.count} poses`).join(', ')}) × {attemptsPerPose} attempts
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-right text-sm mt-1">
                    Subtotal: <strong>{group.subtotal}</strong> outputs
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
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
        {/* Selected Talent Images Preview */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">
            Selected Talent References ({selectedTalentLooks.length} looks)
          </p>
          <ScrollArea className="h-64">
            <div className="space-y-4">
              {selectedTalentLooks.map(tl => {
                const lookImages = allTalentImages.filter(img => img.look_id === tl.lookId);
                return (
                  <div key={`${tl.talentId}_${tl.lookId}`} className="border-b pb-3 last:border-b-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{tl.talentName}</span>
                      <span className="text-muted-foreground">-</span>
                      <span className="text-sm">{tl.lookName}</span>
                      {tl.productType && (
                        <Badge variant="secondary" className="text-xs">{tl.productType}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {lookImages.map((img) => (
                        <div
                          key={img.id}
                          className="aspect-[3/4] rounded-lg overflow-hidden relative ring-2 ring-primary"
                        >
                          <img
                            src={img.stored_url}
                            alt={img.view}
                            className="w-full h-full object-cover"
                          />
                          <Badge 
                            className="absolute bottom-1 left-1 text-xs"
                            variant="default"
                          >
                            {img.view}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {selectedTalentLooks.length === 0 && (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-8 h-8" />
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Available Clay Poses by Slot */}
        <Card className="p-4">
          <p className="text-sm font-medium mb-2">
            Available Poses by Slot
          </p>
          <ScrollArea className="h-64">
            {!selectedBrand ? (
              <div className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ImageIcon className="w-8 h-8" />
                <p className="text-sm">Select a brand to see available clay poses</p>
              </div>
            ) : allClayImages.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ImageIcon className="w-8 h-8" />
                <p className="text-sm">No clay poses found for this brand</p>
                <p className="text-xs">Generate clay images first in the Clay Generation panel</p>
              </div>
            ) : (
              <div className="space-y-3">
                {SLOT_CONFIG.map(({ slot, label }) => {
                  // Show poses without product type filter for overview
                  const poses = allClayImages.filter(c => {
                    const s = c.product_images?.slot as ImageSlot;
                    if (s !== slot) return false;
                    if (selectedGender !== "all" && c.product_images?.products?.gender !== selectedGender) return false;
                    return true;
                  });
                  
                  // Count by product type for breakdown
                  const topsPoses = poses.filter(p => p.product_images?.products?.product_type === 'tops').length;
                  const bottomsPoses = poses.filter(p => p.product_images?.products?.product_type === 'trousers').length;
                  
                  return (
                    <div 
                      key={slot}
                      className={`p-2 rounded-lg border ${poses.length === 0 ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{label}</span>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-xs">
                            {poses.length} total
                          </Badge>
                          {topsPoses > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {topsPoses} tops
                            </Badge>
                          )}
                          {bottomsPoses > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {bottomsPoses} bottoms
                            </Badge>
                          )}
                        </div>
                      </div>
                      {poses.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No poses for this slot</p>
                      ) : (
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
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
