import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { usePipelineJobs } from "@/hooks/usePipelineJobs";
import type { Brand, ProductImage, ClayImage, ImageSlot } from "@/types/avatar-repose";

const SLOTS: ImageSlot[] = ["A", "B", "C", "D"];
const SLOT_LABELS: Record<ImageSlot, string> = {
  A: "Full Front",
  B: "Cropped Front",
  C: "Full Back",
  D: "Detail",
};

export function ClayGenerationPanel() {
  const navigate = useNavigate();
  const { createJob, updateProgress, setStatus } = usePipelineJobs();
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
  const shouldStopOrganizeRef = useRef(false);
  const [organizeProgress, setOrganizeProgress] = useState({ current: 0, total: 0 });
  const [organizeStats, setOrganizeStats] = useState({ moved: 0, deletedKids: 0, deletedProducts: 0 });
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash-image-preview");
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const imageModels = [
    { value: "google/gemini-2.5-flash-image-preview", label: "Flash" },
    { value: "google/gemini-3-pro-image-preview", label: "Pro" },
  ];

  // Get filtered images - show ALL images matching filters
  const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
  const filteredImages = productImages.filter((img) => selectedSlots.has(img.slot));
  const pendingImages = filteredImages.filter((img) => !existingClayIds.has(img.id));

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
    setSelectedImages(new Set(filteredImages.map((img) => img.id)));
  }, [filteredImages]);

  const clearSelection = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  useKeyboardShortcuts({
    onInclude: () => {}, // Not applicable for clay generation
    onExclude: handleBulkDelete,
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
    
    const brandName = brands.find(b => b.id === selectedBrand)?.name || 'Unknown';
    
    // Create a pipeline job for tracking
    let jobId: string | null = null;
    try {
      jobId = await createJob({
        type: 'CLAY_GENERATION',
        title: `Generate Clay - ${brandName}`,
        total: imagesToProcess.length,
        origin_route: `/brand-pose-library?tab=clay`,
        origin_context: { brandId: selectedBrand, brandName, slots: Array.from(selectedSlots) },
        supports_pause: false,
        supports_retry: false,
      });
    } catch (err) {
      console.error('Failed to create pipeline job:', err);
    }
    
    toast.info(`Generating clay for ${imagesToProcess.length} images...`);

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const img of imagesToProcess) {
      if (shouldStopRef.current) {
        toast.info(`Stopped after ${processed} images`);
        if (jobId) await setStatus(jobId, 'CANCELED');
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
        } else if (error) {
          failedCount++;
        }
      } catch (err) {
        console.error(`Failed to process ${img.id}:`, err);
        failedCount++;
      }
      processed++;
      setProgress({ current: processed, total: imagesToProcess.length });
      
      // Update pipeline job progress
      if (jobId) {
        await updateProgress(jobId, { 
          done: successCount, 
          failed: failedCount,
          message: `Processing ${processed}/${imagesToProcess.length}...`
        });
      }
      
      if (processed < imagesToProcess.length && !shouldStopRef.current) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    setIsGenerating(false);
    if (!shouldStopRef.current) {
      if (jobId) await setStatus(jobId, 'COMPLETED');
      toast.success(`Clay complete! ${successCount} processed.`, {
        action: {
          label: "View Results",
          onClick: () => navigate(`/brand-pose-library?tab=clay`),
        },
      });
    }
  };

  const handleStopGeneration = () => {
    shouldStopRef.current = true;
    toast.info("Stopping...");
  };

  const handleOrganizeImages = async () => {
    if (!selectedBrand) return;
    setIsOrganizing(true);
    shouldStopOrganizeRef.current = false;
    setOrganizeProgress({ current: 0, total: 0 });
    setOrganizeStats({ moved: 0, deletedKids: 0, deletedProducts: 0 });

    try {
      // Get list of images to organize
      const { data, error } = await supabase.functions.invoke("organize-clay-poses", { body: { brandId: selectedBrand } });
      if (error) throw error;

      if (!data.images || data.images.length === 0) {
        toast.info("No images to organize!");
        setIsOrganizing(false);
        return;
      }

      const images = data.images as { id: string; imageUrl: string; currentSlot: string }[];
      setOrganizeProgress({ current: 0, total: images.length });
      toast.info(`AVA analyzing ${images.length} images...`);

      let moved = 0;
      let deletedKids = 0;
      let deletedProducts = 0;
      let processed = 0;

      for (const img of images) {
        if (shouldStopOrganizeRef.current) {
          toast.info(`Stopped after ${processed} images`);
          break;
        }

        try {
          const { data: result, error: classifyError } = await supabase.functions.invoke("organize-clay-single", {
            body: { imageId: img.id, imageUrl: img.imageUrl },
          });

          if (classifyError || !result?.action) {
            console.error(`Failed to classify ${img.id}`);
          } else {
            const action = result.action;

            if (action === "DELETE_CHILD") {
              await supabase.from("clay_images").delete().eq("product_image_id", img.id);
              await supabase.from("product_images").delete().eq("id", img.id);
              setProductImages((prev) => prev.filter((p) => p.id !== img.id));
              setClayImages((prev) => prev.filter((c) => c.product_image_id !== img.id));
              deletedKids++;
            } else if (action === "DELETE_PRODUCT") {
              await supabase.from("clay_images").delete().eq("product_image_id", img.id);
              await supabase.from("product_images").delete().eq("id", img.id);
              setProductImages((prev) => prev.filter((p) => p.id !== img.id));
              setClayImages((prev) => prev.filter((c) => c.product_image_id !== img.id));
              deletedProducts++;
            } else if (["A", "B", "C", "D"].includes(action) && action !== img.currentSlot) {
              await supabase.from("product_images").update({ slot: action }).eq("id", img.id);
              setProductImages((prev) =>
                prev.map((p) => (p.id === img.id ? { ...p, slot: action } : p))
              );
              moved++;
            }
          }
        } catch (err) {
          console.error(`Error processing ${img.id}:`, err);
        }

        processed++;
        setOrganizeProgress({ current: processed, total: images.length });
        setOrganizeStats({ moved, deletedKids, deletedProducts });

        // Small delay to avoid rate limiting
        if (processed < images.length && !shouldStopOrganizeRef.current) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      if (!shouldStopOrganizeRef.current) {
        const totalDeleted = deletedKids + deletedProducts;
        toast.success(
          `AVA complete! Moved: ${moved}, Deleted: ${totalDeleted} (${deletedKids} kids, ${deletedProducts} products)`
        );
      }
    } catch (err) {
      console.error("Organize error:", err);
      toast.error("Failed to organize");
    } finally {
      setIsOrganizing(false);
    }
  };

  const handleStopOrganize = () => {
    shouldStopOrganizeRef.current = true;
    toast.info("Stopping AVA...");
  };

  // Selection with shift-click support
  const handleImageClick = (imageId: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedId) {
      const ids = filteredImages.map((img) => img.id);
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
      // Plain click - toggle selection (add/remove)
      setSelectedImages((prev) => {
        const next = new Set(prev);
        if (next.has(imageId)) {
          next.delete(imageId);
        } else {
          next.add(imageId);
        }
        return next;
      });
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

        {/* AVA Organise */}
        {isOrganizing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {organizeProgress.current}/{organizeProgress.total}
            </span>
            <Button variant="destructive" size="sm" onClick={handleStopOrganize}>
              <StopCircle className="w-4 h-4 mr-1" />
              Stop
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOrganizeImages}
            disabled={!selectedBrand}
            className="text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="w-4 h-4 mr-1" />
            AVA
          </Button>
        )}

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

      {/* Dense Image Grid - Grouped by Slot */}
      <div className="flex-1 overflow-auto p-3 space-y-4" ref={gridRef}>
        {selectedBrand && filteredImages.length > 0 && (
          <>
            {SLOTS.filter((slot) => selectedSlots.has(slot)).map((slot) => {
              const slotImages = filteredImages.filter((img) => img.slot === slot);
              if (slotImages.length === 0) return null;
              return (
                <div key={slot}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs font-semibold">
                      {slot}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {SLOT_LABELS[slot]} · {slotImages.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-14 gap-1.5">
                    {slotImages.map((img) => {
                      const isSelected = selectedImages.has(img.id);
                      const hasClay = existingClayIds.has(img.id);
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

                          {/* Clay status indicator */}
                          {hasClay && (
                            <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-500/90 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}

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
                </div>
              );
            })}
          </>
        )}

        {/* Empty States */}
        {selectedBrand && productImages.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            <Palette className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No product images found</p>
            <p className="text-sm">Scrape a brand first</p>
          </Card>
        )}

        {selectedBrand && productImages.length > 0 && filteredImages.length === 0 && (
          <Card className="p-6 text-center border-primary/30 bg-primary/5">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="font-medium">No images match the current filters</p>
            <p className="text-sm text-muted-foreground">Try adjusting slot or gender filters</p>
          </Card>
        )}

        {!selectedBrand && (
          <Card className="p-8 text-center text-muted-foreground">
            <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Select a brand to view images</p>
          </Card>
        )}
      </div>

      {/* Stats Bar */}
      <div className="border-t bg-background p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (selectedImages.size === filteredImages.length ? clearSelection() : selectAll())}
            disabled={filteredImages.length === 0}
          >
            {selectedImages.size === filteredImages.length && filteredImages.length > 0 ? (
              <XIcon className="w-4 h-4 mr-1" />
            ) : (
              <Checkbox checked={selectedImages.size > 0 && selectedImages.size === filteredImages.length} className="mr-1" />
            )}
            {selectedImages.size === filteredImages.length && filteredImages.length > 0 ? "Deselect All" : "Select All"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {filteredImages.length} images · {pendingImages.length} pending
          </span>
        </div>
      </div>

      {/* Floating Bulk Actions Toolbar */}
      {selectedImages.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedImages.size} selected
          </span>
          
          <div className="h-4 w-px bg-border" />
          
          {/* Move to Slot Buttons */}
          {SLOTS.map((slot, index) => (
            <Button
              key={slot}
              variant="outline"
              size="sm"
              onClick={() => handleBulkMove(slot)}
              title={`Move to ${SLOT_LABELS[slot]}`}
            >
              {slot} <span className="text-muted-foreground ml-1">({index + 1})</span>
            </Button>
          ))}
          
          <div className="h-4 w-px bg-border" />
          
          <Button 
            variant="destructive" 
            size="sm" 
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete <span className="text-destructive-foreground/70 ml-1">(Del)</span>
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearSelection}
          >
            <XIcon className="h-4 w-4 mr-2" />
            Clear <span className="text-muted-foreground ml-1">(Esc)</span>
          </Button>
        </div>
      )}
    </div>
  );
}
