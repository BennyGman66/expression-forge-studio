import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, User, Shirt, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  const [selectedGender, setSelectedGender] = useState<string>("all");

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

  const getFilteredPoses = (gender: string | null, productType: string | null, slot: string) => {
    return clayPoses.filter((pose) => {
      const genderMatch = gender === null 
        ? pose.gender === null 
        : pose.gender?.toLowerCase() === gender.toLowerCase();
      const typeMatch = productType === null 
        ? pose.product_type === null 
        : pose.product_type?.toLowerCase() === productType.toLowerCase();
      return genderMatch && typeMatch && pose.slot === slot;
    });
  };

  const getCategorizedCount = () => {
    return clayPoses.filter(
      (p) => p.gender && p.product_type && 
        GENDERS.includes(p.gender.toLowerCase() as any) &&
        PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any)
    ).length;
  };

  const getUncategorizedCount = () => {
    return clayPoses.filter(
      (p) => !p.gender || !p.product_type ||
        !GENDERS.includes((p.gender || "").toLowerCase() as any) ||
        !PRODUCT_TYPES.includes((p.product_type || "").toLowerCase() as any)
    ).length;
  };

  const getPosesBySlot = (slot: string) => {
    return clayPoses.filter((pose) => pose.slot === slot);
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

  const uncategorizedCount = getUncategorizedCount();

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5" />
          Clay Pose Library
        </h2>
        <Badge variant="secondary">{clayPoses.length} total poses</Badge>
      </div>

      {uncategorizedCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {uncategorizedCount} pose{uncategorizedCount > 1 ? 's' : ''} need gender/product type classification. 
            Set these on your products to organize them properly.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={selectedGender} onValueChange={setSelectedGender}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All Poses</TabsTrigger>
          <TabsTrigger value="women">Women</TabsTrigger>
          <TabsTrigger value="men">Men</TabsTrigger>
        </TabsList>

        {/* All Poses View */}
        <TabsContent value="all" className="space-y-4 mt-4">
          <div className="grid grid-cols-4 gap-4">
            {SLOTS.map((slot) => {
              const poses = getPosesBySlot(slot);
              
              return (
                <div key={slot} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Slot {slot}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {poses.length}
                    </Badge>
                  </div>
                  <ScrollArea className="h-[400px] border rounded-lg bg-muted/30">
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
                            <div className="absolute bottom-1 left-1 right-1 bg-background/80 text-xs px-1 py-0.5 rounded truncate">
                              {pose.sku || "No SKU"}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* Gender-specific views */}
        {GENDERS.map((gender) => (
          <TabsContent key={gender} value={gender} className="space-y-4 mt-4">
            {PRODUCT_TYPES.map((productType) => {
              const count = clayPoses.filter(
                (p) =>
                  p.gender?.toLowerCase() === gender.toLowerCase() &&
                  p.product_type?.toLowerCase() === productType.toLowerCase()
              ).length;
              
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

            {/* Uncategorized for this gender */}
            {clayPoses.filter(
              (p) =>
                p.gender?.toLowerCase() === gender.toLowerCase() &&
                (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
            ).length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-muted-foreground">Uncategorized (no product type)</h3>
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
