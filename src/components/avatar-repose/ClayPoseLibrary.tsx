import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, User, Shirt } from "lucide-react";

interface ClayPoseItem {
  id: string;
  stored_url: string;
  product_image_id: string;
  slot: string;
  gender: string | null;
  product_type: string | null;
  sku: string | null;
}

const SLOTS = ["A", "B", "C", "D"] as const;
const GENDERS = ["women", "men"] as const;
const PRODUCT_TYPES = ["tops", "trousers"] as const;

export function ClayPoseLibrary() {
  const [clayPoses, setClayPoses] = useState<ClayPoseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGender, setSelectedGender] = useState<string>("women");

  useEffect(() => {
    fetchClayPoses();
  }, []);

  const fetchClayPoses = async () => {
    setLoading(true);
    
    // Fetch clay images with product info via joins
    const { data: clayImages, error } = await supabase
      .from("clay_images")
      .select(`
        id,
        stored_url,
        product_image_id,
        product_images!inner (
          slot,
          products!inner (
            gender,
            product_type,
            sku
          )
        )
      `);

    if (error) {
      console.error("Error fetching clay poses:", error);
      setLoading(false);
      return;
    }

    // Transform the data
    const poses: ClayPoseItem[] = (clayImages || []).map((clay: any) => ({
      id: clay.id,
      stored_url: clay.stored_url,
      product_image_id: clay.product_image_id,
      slot: clay.product_images?.slot || "",
      gender: clay.product_images?.products?.gender || null,
      product_type: clay.product_images?.products?.product_type || null,
      sku: clay.product_images?.products?.sku || null,
    }));

    setClayPoses(poses);
    setLoading(false);
  };

  const getFilteredPoses = (gender: string, productType: string, slot: string) => {
    return clayPoses.filter(
      (pose) =>
        pose.gender?.toLowerCase() === gender.toLowerCase() &&
        pose.product_type?.toLowerCase() === productType.toLowerCase() &&
        pose.slot === slot
    );
  };

  const getCountForCategory = (gender: string, productType: string) => {
    return clayPoses.filter(
      (pose) =>
        pose.gender?.toLowerCase() === gender.toLowerCase() &&
        pose.product_type?.toLowerCase() === productType.toLowerCase()
    ).length;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading clay pose library...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5" />
          Clay Pose Library
        </h2>
        <Badge variant="secondary">{clayPoses.length} total poses</Badge>
      </div>

      <Tabs value={selectedGender} onValueChange={setSelectedGender}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="women">Women</TabsTrigger>
          <TabsTrigger value="men">Men</TabsTrigger>
        </TabsList>

        {GENDERS.map((gender) => (
          <TabsContent key={gender} value={gender} className="space-y-4 mt-4">
            {PRODUCT_TYPES.map((productType) => {
              const count = getCountForCategory(gender, productType);
              
              return (
                <div key={productType} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shirt className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-medium capitalize">{productType}</h3>
                    <Badge variant="outline" className="text-xs">
                      {count} images
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    {SLOTS.map((slot) => {
                      const poses = getFilteredPoses(gender, productType, slot);
                      
                      return (
                        <div key={slot} className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground text-center">
                            Slot {slot}
                          </div>
                          <ScrollArea className="h-48 border rounded-lg bg-muted/30">
                            <div className="p-2 space-y-2">
                              {poses.length === 0 ? (
                                <div className="text-xs text-muted-foreground text-center py-4">
                                  No poses
                                </div>
                              ) : (
                                poses.map((pose) => (
                                  <div
                                    key={pose.id}
                                    className="relative group cursor-pointer"
                                  >
                                    <img
                                      src={pose.stored_url}
                                      alt={`Clay pose ${pose.slot}`}
                                      className="w-full aspect-[3/4] object-cover rounded border bg-background"
                                    />
                                    {pose.sku && (
                                      <div className="absolute bottom-1 left-1 right-1 bg-background/80 text-xs px-1 py-0.5 rounded truncate">
                                        {pose.sku}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Uncategorized section */}
            {clayPoses.filter(
              (p) =>
                p.gender?.toLowerCase() === gender.toLowerCase() &&
                (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
            ).length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-muted-foreground">Uncategorized</h3>
                  <Badge variant="outline" className="text-xs">
                    {clayPoses.filter(
                      (p) =>
                        p.gender?.toLowerCase() === gender.toLowerCase() &&
                        (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
                    ).length} images
                  </Badge>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {clayPoses
                    .filter(
                      (p) =>
                        p.gender?.toLowerCase() === gender.toLowerCase() &&
                        (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
                    )
                    .map((pose) => (
                      <img
                        key={pose.id}
                        src={pose.stored_url}
                        alt={`Clay pose`}
                        className="w-full aspect-[3/4] object-cover rounded border"
                      />
                    ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
