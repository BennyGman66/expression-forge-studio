import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Palette, Image as ImageIcon, Trash2, ArrowRightLeft, CheckCircle2, Sparkles, CheckSquare, Square, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { Brand, ProductImage, ClayImage, ImageSlot } from "@/types/avatar-repose";

export function ClayGenerationPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedProductType, setSelectedProductType] = useState<string>("all");
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set(["A", "B", "C", "D"]));
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [clayImages, setClayImages] = useState<ClayImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [organizeJobId, setOrganizeJobId] = useState<string | null>(null);
  const [organizeProgress, setOrganizeProgress] = useState({ current: 0, total: 0 });
  const [clayJobId, setClayJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash-image-preview");

  const imageModels = [
    { value: "google/gemini-2.5-flash-image-preview", label: "Gemini 2.5 Flash (Image)" },
    { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro (Image)" },
  ];

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      fetchProductImages();
      fetchClayImages();
    }
  }, [selectedBrand, selectedGender, selectedProductType]);

  // Subscribe to clay job progress
  useEffect(() => {
    if (!clayJobId) return;

    const channel = supabase
      .channel("clay-progress")
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "jobs",
          filter: `id=eq.${clayJobId}`
        },
        (payload) => {
          const job = payload.new as { progress: number; total: number; status: string };
          setProgress({ current: job.progress || 0, total: job.total || 0 });
          
          if (job.status === "completed") {
            setIsGenerating(false);
            setClayJobId(null);
            toast.success("Clay generation complete!");
            fetchClayImages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clayJobId]);

  // Subscribe to organize job progress
  useEffect(() => {
    if (!organizeJobId) return;

    const channel = supabase
      .channel("organize-progress")
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "jobs",
          filter: `id=eq.${organizeJobId}`
        },
        (payload) => {
          const job = payload.new as { progress: number; total: number; status: string };
          setOrganizeProgress({ current: job.progress || 0, total: job.total || 0 });
          
          if (job.status === "completed") {
            setIsOrganizing(false);
            setOrganizeJobId(null);
            toast.success("AVA finished organizing your images!");
            fetchProductImages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizeJobId]);

  const fetchBrands = async () => {
    const { data } = await supabase
      .from("brands")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setBrands(data);
  };

  const fetchProductImages = async () => {
    let query = supabase
      .from("product_images")
      .select("*, products!inner(brand_id, gender, product_type)")
      .eq("products.brand_id", selectedBrand);

    if (selectedGender !== "all") {
      query = query.eq("products.gender", selectedGender);
    }

    if (selectedProductType !== "all") {
      query = query.eq("products.product_type", selectedProductType);
    }

    const { data } = await query;
    if (data) {
      setProductImages(data as unknown as ProductImage[]);
    }
  };

  const fetchClayImages = async () => {
    const { data } = await supabase
      .from("clay_images")
      .select("*, product_images!inner(product_id, products!inner(brand_id))")
      .eq("product_images.products.brand_id", selectedBrand);
    
    if (data) {
      setClayImages(data as unknown as ClayImage[]);
    }
  };

  const toggleSlot = (slot: string) => {
    const next = new Set(selectedSlots);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    setSelectedSlots(next);
  };

  const handleGenerateClay = async () => {
    // Filter images that don't already have clay versions
    const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
    const imagesToProcess = productImages.filter(
      (img) => selectedSlots.has(img.slot) && img.stored_url && !existingClayIds.has(img.id)
    );

    if (imagesToProcess.length === 0) {
      toast.error("No new images to process (all already have clay versions)");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: imagesToProcess.length });

    try {
      const { data, error } = await supabase.functions.invoke("generate-clay", {
        body: {
          brandId: selectedBrand,
          imageIds: imagesToProcess.map((img) => img.id),
          model: selectedModel,
        },
      });

      if (error) throw error;

      if (data?.jobId) {
        setClayJobId(data.jobId);
        toast.info(`Generating clay for ${imagesToProcess.length} images...`);
      }
    } catch (err) {
      console.error("Clay generation error:", err);
      toast.error("Failed to start clay generation");
      setIsGenerating(false);
    }
  };

  const handleOrganizeImages = async () => {
    if (!selectedBrand) {
      toast.error("Please select a brand first");
      return;
    }

    setIsOrganizing(true);
    setOrganizeProgress({ current: 0, total: 0 });

    try {
      const { data, error } = await supabase.functions.invoke("organize-images", {
        body: { brandId: selectedBrand },
      });

      if (error) throw error;

      if (data.total > 0) {
        setOrganizeJobId(data.jobId);
        setOrganizeProgress({ current: 0, total: data.total });
        toast.info(`AVA is analyzing ${data.total} images...`);
      } else {
        toast.info("No images to organize!");
        setIsOrganizing(false);
      }
    } catch (err) {
      console.error("Organize error:", err);
      toast.error("Failed to organize images");
      setIsOrganizing(false);
    }
  };

  // Display order: A (Full Front), B (Cropped Front), D (Detail), C (Full Back)
  const slots: ImageSlot[] = ["A", "B", "D", "C"];
  const slotLabels: Record<ImageSlot, string> = {
    A: "Full Front",
    B: "Cropped Front",
    D: "Detail",
    C: "Full Back",
  };

  const getImagesForSlot = (slot: string) => {
    return productImages.filter((img) => img.slot === slot);
  };

  const getClayForImage = (imageId: string) => {
    return clayImages.find((c) => c.product_image_id === imageId);
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      // First delete any clay images associated with this product image
      await supabase
        .from("clay_images")
        .delete()
        .eq("product_image_id", imageId);

      // Then delete the product image
      const { error } = await supabase
        .from("product_images")
        .delete()
        .eq("id", imageId);

      if (error) throw error;

      // Update local state
      setProductImages((prev) => prev.filter((img) => img.id !== imageId));
      setClayImages((prev) => prev.filter((c) => c.product_image_id !== imageId));
      toast.success("Image deleted");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete image");
    }
  };

  const handleMoveToSlot = async (imageId: string, newSlot: string) => {
    try {
      const { error } = await supabase
        .from("product_images")
        .update({ slot: newSlot })
        .eq("id", imageId);

      if (error) throw error;

      // Update local state
      setProductImages((prev) =>
        prev.map((img) =>
          img.id === imageId ? { ...img, slot: newSlot } : img
        )
      );
      toast.success(`Moved to slot ${newSlot}`);
    } catch (err) {
      console.error("Move error:", err);
      toast.error("Failed to move image");
    }
  };

  // Selection handlers
  const toggleImageSelection = (imageId: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  const selectAllInSlot = (slot: string) => {
    const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
    const slotImages = getImagesForSlot(slot).filter((img) => !existingClayIds.has(img.id));
    setSelectedImages((prev) => {
      const next = new Set(prev);
      slotImages.forEach((img) => next.add(img.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedImages(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedImages.size === 0) return;
    
    const imageIds = Array.from(selectedImages);
    
    try {
      // Delete clay images first
      await supabase
        .from("clay_images")
        .delete()
        .in("product_image_id", imageIds);

      // Then delete product images
      const { error } = await supabase
        .from("product_images")
        .delete()
        .in("id", imageIds);

      if (error) throw error;

      // Update local state
      setProductImages((prev) => prev.filter((img) => !selectedImages.has(img.id)));
      setClayImages((prev) => prev.filter((c) => !selectedImages.has(c.product_image_id)));
      toast.success(`Deleted ${imageIds.length} images`);
      clearSelection();
    } catch (err) {
      console.error("Bulk delete error:", err);
      toast.error("Failed to delete images");
    }
  };

  const handleBulkMove = async (newSlot: string) => {
    if (selectedImages.size === 0) return;
    
    const imageIds = Array.from(selectedImages);
    
    try {
      const { error } = await supabase
        .from("product_images")
        .update({ slot: newSlot })
        .in("id", imageIds);

      if (error) throw error;

      // Update local state
      setProductImages((prev) =>
        prev.map((img) =>
          selectedImages.has(img.id) ? { ...img, slot: newSlot } : img
        )
      );
      toast.success(`Moved ${imageIds.length} images to ${slotLabels[newSlot as ImageSlot]}`);
      clearSelection();
    } catch (err) {
      console.error("Bulk move error:", err);
      toast.error("Failed to move images");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* AVA Organise Button with Progress */}
      <div className="space-y-2">
        <Button
          onClick={handleOrganizeImages}
          disabled={isOrganizing || !selectedBrand}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 hover:from-violet-600 hover:via-fuchsia-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 border-0"
        >
          {isOrganizing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              AVA is organizing... {organizeProgress.total > 0 && `(${organizeProgress.current}/${organizeProgress.total})`}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              ✨ AVA Organise
            </>
          )}
        </Button>
        
        {isOrganizing && organizeProgress.total > 0 && (
          <div className="space-y-1">
            <Progress 
              value={(organizeProgress.current / Math.max(organizeProgress.total, 1)) * 100} 
              className="h-2 bg-violet-100"
            />
            <p className="text-xs text-muted-foreground text-center">
              Analyzing image {organizeProgress.current} of {organizeProgress.total}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Generate Clay Models</h3>
        <div className="grid md:grid-cols-3 gap-4 mb-4">
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
            <Label>Product Type</Label>
            <Select value={selectedProductType} onValueChange={setSelectedProductType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="tops">Tops</SelectItem>
                <SelectItem value="trousers">Trousers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>AI Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {imageModels.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 space-y-2">
            <Label>Slots</Label>
            <div className="flex gap-4">
              {slots.map((slot) => (
                <label key={slot} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={selectedSlots.has(slot)}
                    onCheckedChange={() => toggleSlot(slot)}
                  />
                  {slot}
                </label>
              ))}
            </div>
          </div>
          <Button
            onClick={handleGenerateClay}
            disabled={isGenerating || !selectedBrand}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Palette className="w-4 h-4 mr-2" />
                Generate Clay
              </>
            )}
          </Button>
        </div>

        {isGenerating && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2 flex-1" />
              <span className="text-sm font-medium">
                {Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {progress.current} / {progress.total} images processed
            </p>
          </div>
        )}
        
        {!isGenerating && progress.total > 0 && progress.current >= progress.total && (
          <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            <span>Generation complete!</span>
          </div>
        )}
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedImages.size > 0 && (
        <Card className="p-3 sticky top-0 z-10 bg-background/95 backdrop-blur border-primary/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                {selectedImages.size} selected
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Move to...
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {slots.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => handleBulkMove(s)}>
                      {s}: {slotLabels[s]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Image Gallery by Slot - Shows only images without clay versions */}
      {selectedBrand && (
        <div className="space-y-6">
          {slots.map((slot) => {
            const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
            const slotImages = getImagesForSlot(slot).filter(
              (img) => !existingClayIds.has(img.id)
            );
            if (!selectedSlots.has(slot) || slotImages.length === 0) return null;

            const allSlotSelected = slotImages.every((img) => selectedImages.has(img.id));

            return (
              <div key={slot}>
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => selectAllInSlot(slot)}
                  >
                    {allSlotSelected ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </Button>
                  <Badge variant="outline">{slot}</Badge>
                  <span className="text-sm font-medium">{slotLabels[slot]}</span>
                  <span className="text-sm text-muted-foreground">
                    ({slotImages.length} pending)
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {slotImages.map((img) => {
                    const isSelected = selectedImages.has(img.id);
                    return (
                      <div key={img.id} className="space-y-2 group relative">
                        <div 
                          className={`aspect-[3/4] rounded-lg overflow-hidden bg-muted border relative cursor-pointer transition-all ${
                            isSelected ? 'ring-2 ring-primary ring-offset-2' : ''
                          }`}
                          onClick={() => toggleImageSelection(img.id)}
                        >
                          {img.stored_url ? (
                            <img
                              src={img.stored_url}
                              alt="Product"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          {/* Selection indicator */}
                          <div className={`absolute top-2 left-2 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80 border'
                            }`}>
                              {isSelected && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {slots.filter((s) => s !== img.slot).map((s) => (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() => handleMoveToSlot(img.id, s)}
                                  >
                                    Move to {s} ({slotLabels[s]})
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="destructive"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImage(img.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedBrand && productImages.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <Palette className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No product images found</p>
          <p className="text-sm">Scrape a brand first to get images</p>
        </Card>
      )}

      {selectedBrand && productImages.length > 0 && (
        (() => {
          const existingClayIds = new Set(clayImages.map((c) => c.product_image_id));
          const pendingCount = productImages.filter((img) => !existingClayIds.has(img.id)).length;
          const completedCount = clayImages.length;
          
          return pendingCount === 0 ? (
            <Card className="p-6 text-center border-primary/30 bg-primary/5">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-primary" />
              <p className="font-medium">All images have clay versions</p>
              <p className="text-sm text-muted-foreground mt-1">
                {completedCount} clay poses ready in the library
              </p>
            </Card>
          ) : null;
        })()
      )}
    </div>
  );
}
