import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Palette, Image as ImageIcon, Trash2, CheckCircle2, Sparkles, StopCircle, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { Brand, ProductImage, ClayImage, ImageSlot } from "@/types/avatar-repose";

const SLOTS: ImageSlot[] = ["A", "B", "C", "D"];
const SLOT_LABELS: Record<ImageSlot, string> = {
  A: "Full Front",
  B: "Cropped Front",
  C: "Full Back",
  D: "Detail",
};

export function ClayGenerationPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedProductType, setSelectedProductType] = useState<string>("all");
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set(["A", "B", "C", "D"]));
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [clayImages, setClayImages] = useState<ClayImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const shouldStopRef = useRef(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeJobId, setOrganizeJobId] = useState<string | null>(null);
  const [organizeProgress, setOrganizeProgress] = useState({ current: 0, total: 0 });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash-image-preview");
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const imageModels = [
    { value: "google/gemini-2.5-flash-image-preview", label: "Flash" },
    { value: "google/gemini-3-pro-image-preview", label: "Pro" },
  ];

  // Get filtered pending images
  const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
  const pendingImages = productImages.filter(
    (img) => selectedSlots.has(img.slot) && !existingClayIds.has(img.id)
  );

  // Keyboard shortcuts
  const handleBulkMove = useCallback(async (newSlot: string) => {
    if (selectedImages.size === 0) return;
    const imageIds = Array.from(selectedImages);
    try {
      const { error } = await supabase
        .from("product_images")
        .update({ slot: newSlot })
        .in("id", imageIds);
      if (error) throw error;
      setProductImages((prev) =>
        prev.map((img) => (selectedImages.has(img.id) ? { ...img, slot: newSlot } : img))
      );
      toast.success(`Moved ${imageIds.length} to ${SLOT_LABELS[newSlot as ImageSlot]}`);
      setSelectedImages(new Set());
    } catch {
      toast.error("Failed to move images");
    }
  }, [selectedImages]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedImages.size === 0) return;
    const imageIds = Array.from(selectedImages);
    try {
      await supabase.from("clay_images").delete().in("product_image_id", imageIds);
      const { error } = await supabase.from("product_images").delete().in("id", imageIds);
      if (error) throw error;
      setProductImages((prev) => prev.filter((img) => !selectedImages.has(img.id)));
      setClayImages((prev) => prev.filter((c) => !selectedImages.has(c.product_image_id)));
      toast.success(`Deleted ${imageIds.length} images`);
      setSelectedImages(new Set());
    } catch {
      toast.error("Failed to delete images");
    }
  }, [selectedImages]);

  const selectAll = useCallback(() => {
    setSelectedImages(new Set(pendingImages.map((img) => img.id)));
  }, [pendingImages]);

  const clearSelection = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  useKeyboardShortcuts({
    onInclude: () => {}, // Not applicable for clay generation
    onExclude: () => {},
    onMoveToSlotA: () => handleBulkMove("A"),
    onMoveToSlotB: () => handleBulkMove("B"),
    onMoveToSlotC: () => handleBulkMove("C"),
    onMoveToSlotD: () => handleBulkMove("D"),
    onClearSelection: clearSelection,
    onSelectAll: selectAll,
    enabled: selectedImages.size > 0,
  });

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      fetchProductImages();
      fetchClayImages();
    }
  }, [selectedBrand, selectedGender, selectedProductType]);

  useEffect(() => {
    if (isGenerating) {
      shouldStopRef.current = false;
    }
  }, [isGenerating]);

  // Subscribe to new clay images in real-time
  useEffect(() => {
    if (!selectedBrand) return;
    const channel = supabase
      .channel("clay-images-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clay_images" }, (payload) => {
        const newClay = payload.new as ClayImage;
        setClayImages((prev) => (prev.some((c) => c.id === newClay.id) ? prev : [...prev, newClay]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedBrand]);

  // Subscribe to organize job progress
  useEffect(() => {
    if (!organizeJobId) return;
    const channel = supabase
      .channel("organize-progress")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${organizeJobId}` }, (payload) => {
        const job = payload.new as { progress: number; total: number; status: string };
        setOrganizeProgress({ current: job.progress || 0, total: job.total || 0 });
        if (job.status === "completed") {
          setIsOrganizing(false);
          setOrganizeJobId(null);
          toast.success("AVA finished organizing!");
          fetchProductImages();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [organizeJobId]);

  const fetchBrands = async () => {
    const { data } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
    if (data) setBrands(data);
  };

  const fetchProductImages = async () => {
    let query = supabase
      .from("product_images")
      .select("*, products!inner(brand_id, gender, product_type)")
      .eq("products.brand_id", selectedBrand);
    if (selectedGender !== "all") query = query.eq("products.gender", selectedGender);
    if (selectedProductType !== "all") query = query.eq("products.product_type", selectedProductType);
    const { data } = await query;
    if (data) setProductImages(data as unknown as ProductImage[]);
  };

  const fetchClayImages = async () => {
    const { data } = await supabase
      .from("clay_images")
      .select("*, product_images!inner(product_id, products!inner(brand_id))")
      .eq("product_images.products.brand_id", selectedBrand);
    if (data) setClayImages(data as unknown as ClayImage[]);
  };

  const toggleSlot = (slot: string) => {
    const next = new Set(selectedSlots);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    setSelectedSlots(next);
  };

  const handleGenerateClay = async () => {
    const imagesToProcess = pendingImages.filter((img) => img.stored_url);
    if (imagesToProcess.length === 0) {
      toast.error("No new images to process");
      return;
    }
    setIsGenerating(true);
    shouldStopRef.current = false;
    setProgress({ current: 0, total: imagesToProcess.length });
    toast.info(`Generating clay for ${imagesToProcess.length} images...`);

    let processed = 0;
    let successCount = 0;

    for (const img of imagesToProcess) {
      if (shouldStopRef.current) {
        toast.info(`Stopped after ${processed} images`);
        break;
      }
      try {
        const { data, error } = await supabase.functions.invoke("generate-clay-single", {
          body: { imageId: img.id, model: selectedModel },
        });
        if (!error && data?.storedUrl && !data.skipped) {
          successCount++;
          setClayImages((prev) => [...prev, { id: crypto.randomUUID(), product_image_id: img.id, stored_url: data.storedUrl, created_at: new Date().toISOString() } as ClayImage]);
        } else if (data?.skipped) {
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to process ${img.id}:`, err);
      }
      processed++;
      setProgress({ current: processed, total: imagesToProcess.length });
      if (processed < imagesToProcess.length && !shouldStopRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setIsGenerating(false);
    if (!shouldStopRef.current) {
      toast.success(`Clay complete! ${successCount} processed.`);
    }
  };

  const handleStopGeneration = () => {
    shouldStopRef.current = true;
    toast.info("Stopping...");
  };

  const handleOrganizeImages = async () => {
    if (!selectedBrand) return;
    setIsOrganizing(true);
    setOrganizeProgress({ current: 0, total: 0 });
    try {
      const { data, error } = await supabase.functions.invoke("organize-images", { body: { brandId: selectedBrand } });
      if (error) throw error;
      if (data.total > 0) {
        setOrganizeJobId(data.jobId);
        setOrganizeProgress({ current: 0, total: data.total });
        toast.info(`AVA analyzing ${data.total} images...`);
      } else {
        toast.info("No images to organize!");
        setIsOrganizing(false);
      }
    } catch {
      toast.error("Failed to organize");
      setIsOrganizing(false);
    }
  };

  // Selection with shift-click support
  const handleImageClick = (imageId: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedId) {
      const ids = pendingImages.map((img) => img.id);
      const start = ids.indexOf(lastClickedId);
      const end = ids.indexOf(imageId);
      if (start !== -1 && end !== -1) {
        const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1);
        setSelectedImages((prev) => {
          const next = new Set(prev);
          range.forEach((id) => next.add(id));
          return next;
        });
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedImages((prev) => {
        const next = new Set(prev);
        if (next.has(imageId)) next.delete(imageId);
        else next.add(imageId);
        return next;
      });
    } else {
      setSelectedImages(new Set([imageId]));
    }
    setLastClickedId(imageId);
  };

  const handleDeleteImage = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from("clay_images").delete().eq("product_image_id", imageId);
      await supabase.from("product_images").delete().eq("id", imageId);
      setProductImages((prev) => prev.filter((img) => img.id !== imageId));
      setClayImages((prev) => prev.filter((c) => c.product_image_id !== imageId));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const completedCount = clayImages.length;

  return (
    <div className="flex flex-col h-full">
      {/* Compact Top Bar */}
      <div className="border-b bg-background p-3 flex items-center gap-3 flex-wrap">
        {/* Brand */}
        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Brand" />
          </SelectTrigger>
          <SelectContent>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Gender Pills */}
        <div className="flex gap-1">
          {["all", "men", "women"].map((g) => (
            <Button
              key={g}
              variant={selectedGender === g ? "default" : "outline"}
              size="sm"
              className="h-8 px-3"
              onClick={() => setSelectedGender(g)}
            >
              {g === "all" ? "All" : g === "men" ? "M" : "W"}
            </Button>
          ))}
        </div>

        {/* Product Type Pills */}
        <div className="flex gap-1">
          {["all", "tops", "trousers"].map((t) => (
            <Button
              key={t}
              variant={selectedProductType === t ? "default" : "outline"}
              size="sm"
              className="h-8 px-3"
              onClick={() => setSelectedProductType(t)}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>

        {/* Slot Checkboxes */}
        <div className="flex items-center gap-2 border-l pl-3">
          {SLOTS.map((slot) => (
            <label key={slot} className="flex items-center gap-1 text-sm cursor-pointer">
              <Checkbox
                checked={selectedSlots.has(slot)}
                onCheckedChange={() => toggleSlot(slot)}
                className="h-4 w-4"
              />
              <span>{slot}</span>
            </label>
          ))}
        </div>

        {/* Model Selector */}
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {imageModels.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Spacer */}
        <div className="flex-1" />

        {/* AVA Organise (Ghost) */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOrganizeImages}
          disabled={isOrganizing || !selectedBrand}
          className="text-muted-foreground hover:text-foreground"
        >
          {isOrganizing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
              {organizeProgress.total > 0 && `${organizeProgress.current}/${organizeProgress.total}`}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-1" />
              AVA
            </>
          )}
        </Button>

        {/* Generate / Stop */}
        {isGenerating ? (
          <Button variant="destructive" size="sm" onClick={handleStopGeneration}>
            <StopCircle className="w-4 h-4 mr-1" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={handleGenerateClay} disabled={!selectedBrand || pendingImages.length === 0}>
            <Palette className="w-4 h-4 mr-1" />
            Generate ({pendingImages.length})
          </Button>
        )}
      </div>

      {/* Progress Bar (when generating) */}
      {isGenerating && (
        <div className="px-3 py-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-1.5 flex-1" />
            <span className="text-xs font-medium">{progress.current}/{progress.total}</span>
          </div>
        </div>
      )}

      {/* Dense Image Grid */}
      <div className="flex-1 overflow-auto p-3" ref={gridRef}>
        {selectedBrand && pendingImages.length > 0 && (
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-1.5">
            {pendingImages.map((img) => {
              const isSelected = selectedImages.has(img.id);
              return (
                <div
                  key={img.id}
                  className={`aspect-[3/4] rounded overflow-hidden relative cursor-pointer group transition-all ${
                    isSelected ? "ring-2 ring-primary ring-offset-1 scale-[1.02]" : "hover:ring-1 hover:ring-muted-foreground/50"
                  }`}
                  onClick={(e) => handleImageClick(img.id, e)}
                >
                  {img.stored_url ? (
                    <img src={img.stored_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Slot Badge */}
                  <Badge
                    variant="secondary"
                    className="absolute bottom-1 left-1 text-[10px] px-1 py-0 h-4 bg-background/80 backdrop-blur"
                  >
                    {img.slot}
                  </Badge>

                  {/* Selection Checkbox */}
                  <div
                    className={`absolute top-1 left-1 w-5 h-5 rounded flex items-center justify-center transition-opacity ${
                      isSelected ? "opacity-100 bg-primary text-primary-foreground" : "opacity-0 group-hover:opacity-100 bg-background/80 border"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>

                  {/* Delete on Hover */}
                  <button
                    onClick={(e) => handleDeleteImage(img.id, e)}
                    className="absolute top-1 right-1 w-5 h-5 rounded bg-destructive/80 text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty States */}
        {selectedBrand && productImages.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Palette className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No product images found</p>
            <p className="text-sm">Scrape a brand first</p>
          </Card>
        )}

        {selectedBrand && productImages.length > 0 && pendingImages.length === 0 && (
          <Card className="p-6 text-center border-primary/30 bg-primary/5">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="font-medium">All images have clay versions</p>
            <p className="text-sm text-muted-foreground">{completedCount} clay poses ready</p>
          </Card>
        )}

        {!selectedBrand && (
          <Card className="p-8 text-center text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Select a brand to view images</p>
          </Card>
        )}
      </div>

      {/* Persistent Bulk Action Bar */}
      <div className="border-t bg-background p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (selectedImages.size === pendingImages.length ? clearSelection() : selectAll())}
            disabled={pendingImages.length === 0}
          >
            {selectedImages.size === pendingImages.length && pendingImages.length > 0 ? (
              <XIcon className="w-4 h-4 mr-1" />
            ) : (
              <Checkbox checked={selectedImages.size > 0 && selectedImages.size === pendingImages.length} className="mr-1" />
            )}
            {selectedImages.size === pendingImages.length && pendingImages.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {pendingImages.length} images{selectedImages.size > 0 && ` · ${selectedImages.size} selected`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Move to Slot Buttons */}
          {SLOTS.map((slot) => (
            <Button
              key={slot}
              variant="outline"
              size="sm"
              onClick={() => handleBulkMove(slot)}
              disabled={selectedImages.size === 0}
              className="w-8 h-8 p-0"
              title={`Move to ${SLOT_LABELS[slot]} (${slot === "A" ? "1" : slot === "B" ? "2" : slot === "C" ? "3" : "4"})`}
            >
              {slot}
            </Button>
          ))}

          {/* Delete */}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={selectedImages.size === 0}
            className="ml-2"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
