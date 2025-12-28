import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Palette, Image as ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Brand, ProductImage, ClayImage, ImageSlot } from "@/types/avatar-repose";

export function ClayGenerationPanel() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set(["A", "B", "C", "D"]));
  const [productImages, setProductImages] = useState<ProductImage[]>([]);
  const [clayImages, setClayImages] = useState<ClayImage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    fetchBrands();
  }, []);

  useEffect(() => {
    if (selectedBrand) {
      fetchProductImages();
      fetchClayImages();
    }
  }, [selectedBrand, selectedGender]);

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
      .select("*, products!inner(brand_id, gender)")
      .eq("products.brand_id", selectedBrand);

    if (selectedGender !== "all") {
      query = query.eq("products.gender", selectedGender);
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
    const imagesToProcess = productImages.filter(
      (img) => selectedSlots.has(img.slot) && img.stored_url
    );

    if (imagesToProcess.length === 0) {
      toast.error("No images to process");
      return;
    }

    setIsGenerating(true);
    setProgress({ current: 0, total: imagesToProcess.length });

    try {
      const { data, error } = await supabase.functions.invoke("generate-clay", {
        body: {
          brandId: selectedBrand,
          imageIds: imagesToProcess.map((img) => img.id),
        },
      });

      if (error) throw error;

      toast.success(`Started clay generation for ${imagesToProcess.length} images`);
    } catch (err) {
      console.error("Clay generation error:", err);
      toast.error("Failed to start clay generation");
    } finally {
      setIsGenerating(false);
    }
  };

  const slots: ImageSlot[] = ["A", "B", "C", "D"];
  const slotLabels: Record<ImageSlot, string> = {
    A: "Front",
    B: "3/4 View",
    C: "Back",
    D: "Detail",
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Controls */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Generate Clay Models</h3>
        <div className="grid md:grid-cols-4 gap-4">
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
            <Label>Slots</Label>
            <div className="flex gap-3 pt-2">
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

          <div className="flex items-end">
            <Button
              onClick={handleGenerateClay}
              disabled={isGenerating || !selectedBrand}
              className="w-full"
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
        </div>

        {isGenerating && (
          <div className="mt-4">
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {progress.current} / {progress.total} images processed
            </p>
          </div>
        )}
      </Card>

      {/* Image Gallery by Slot */}
      {selectedBrand && (
        <div className="space-y-6">
          {slots.map((slot) => {
            const slotImages = getImagesForSlot(slot);
            if (!selectedSlots.has(slot) || slotImages.length === 0) return null;

            return (
              <div key={slot}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline">{slot}</Badge>
                  <span className="text-sm font-medium">{slotLabels[slot]}</span>
                  <span className="text-sm text-muted-foreground">
                    ({slotImages.length} images)
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {slotImages.slice(0, 12).map((img) => {
                    const clay = getClayForImage(img.id);
                    return (
                      <div key={img.id} className="space-y-2 group relative">
                        <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border relative">
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
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteImage(img.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {clay && (
                          <div className="aspect-[3/4] rounded-lg overflow-hidden bg-muted border border-primary/50">
                            <img
                              src={clay.stored_url}
                              alt="Clay model"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
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
    </div>
  );
}
