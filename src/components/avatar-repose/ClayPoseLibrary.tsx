import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Loader2, User, Shirt, AlertCircle, Building2, Trash2, ArrowRightLeft, 
  CheckCircle2, X, Sparkles, CheckSquare, Square 
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface Brand {
  id: string;
  name: string;
}

interface ClayPoseItem {
  id: string;
  stored_url: string;
  product_image_id: string;
  slot: string;
  gender: string | null;
  product_type: string | null;
  sku: string | null;
  brand_id: string;
  brand_name: string;
}

// Display order: Front Full, Front Cropped, Detail, Back Full
const SLOTS = ["A", "B", "D", "C"] as const;
const SLOT_LABELS: Record<string, string> = {
  A: "Front (Full)",
  B: "Front (Cropped)",
  D: "Detail",
  C: "Back (Full)",
};
const GENDERS = ["women", "men"] as const;
const PRODUCT_TYPES = ["tops", "trousers"] as const;

export function ClayPoseLibrary() {
  const [clayPoses, setClayPoses] = useState<ClayPoseItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  
  // Selection state
  const [selectedPoses, setSelectedPoses] = useState<Set<string>>(new Set());
  
  // AVA Check state
  const [isChecking, setIsChecking] = useState(false);
  const [checkJobId, setCheckJobId] = useState<string | null>(null);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    fetchBrands();
    fetchClayPoses();
  }, []);

  // Subscribe to AVA check job progress
  useEffect(() => {
    if (!checkJobId) return;

    const channel = supabase
      .channel("ava-check-progress")
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "jobs",
          filter: `id=eq.${checkJobId}`
        },
        (payload) => {
          const job = payload.new as { progress: number; total: number; status: string; result: any };
          setCheckProgress({ current: job.progress || 0, total: job.total || 0 });
          
          if (job.status === "completed") {
            setIsChecking(false);
            setCheckJobId(null);
            
            // Handle results
            const result = job.result as { flagged?: number; moved?: number } | null;
            if (result?.moved && result.moved > 0) {
              toast.success(`AVA moved ${result.moved} misplaced poses!`);
              fetchClayPoses();
            } else if (result?.flagged && result.flagged > 0) {
              toast.info(`AVA flagged ${result.flagged} poses that may need review`);
            } else {
              toast.success("AVA check complete - all poses are properly organized!");
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkJobId]);

  const fetchBrands = async () => {
    const { data, error } = await supabase
      .from("brands")
      .select("id, name")
      .order("name");
    
    if (!error && data) {
      setBrands(data);
    }
  };

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
            sku,
            brand_id,
            brands!inner (
              id,
              name
            )
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
      brand_id: clay.product_images?.products?.brand_id || "",
      brand_name: clay.product_images?.products?.brands?.name || "Unknown Brand",
    }));

    setClayPoses(poses);
    setLoading(false);
  };

  // Selection handlers
  const togglePoseSelection = (poseId: string) => {
    setSelectedPoses((prev) => {
      const next = new Set(prev);
      if (next.has(poseId)) {
        next.delete(poseId);
      } else {
        next.add(poseId);
      }
      return next;
    });
  };

  const selectAllInSlot = (slot: string) => {
    const slotPoses = getPosesBySlot(slot);
    setSelectedPoses((prev) => {
      const next = new Set(prev);
      slotPoses.forEach((pose) => next.add(pose.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPoses(new Set());
  };

  // Delete handlers
  const handleDeletePose = async (poseId: string) => {
    try {
      const { error } = await supabase
        .from("clay_images")
        .delete()
        .eq("id", poseId);

      if (error) throw error;

      setClayPoses((prev) => prev.filter((p) => p.id !== poseId));
      setSelectedPoses((prev) => {
        const next = new Set(prev);
        next.delete(poseId);
        return next;
      });
      toast.success("Clay pose deleted");
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete pose");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPoses.size === 0) return;
    
    const poseIds = Array.from(selectedPoses);
    
    try {
      const { error } = await supabase
        .from("clay_images")
        .delete()
        .in("id", poseIds);

      if (error) throw error;

      setClayPoses((prev) => prev.filter((p) => !selectedPoses.has(p.id)));
      toast.success(`Deleted ${poseIds.length} clay poses`);
      clearSelection();
    } catch (err) {
      console.error("Bulk delete error:", err);
      toast.error("Failed to delete poses");
    }
  };

  // Move handlers - moves the underlying product_image slot
  const handleMovePose = async (poseId: string, newSlot: string) => {
    const pose = clayPoses.find((p) => p.id === poseId);
    if (!pose) return;

    try {
      const { error } = await supabase
        .from("product_images")
        .update({ slot: newSlot })
        .eq("id", pose.product_image_id);

      if (error) throw error;

      setClayPoses((prev) =>
        prev.map((p) =>
          p.id === poseId ? { ...p, slot: newSlot } : p
        )
      );
      toast.success(`Moved to ${SLOT_LABELS[newSlot]}`);
    } catch (err) {
      console.error("Move error:", err);
      toast.error("Failed to move pose");
    }
  };

  const handleBulkMove = async (newSlot: string) => {
    if (selectedPoses.size === 0) return;
    
    // Get product_image_ids for selected poses
    const selectedPosesList = clayPoses.filter((p) => selectedPoses.has(p.id));
    const productImageIds = selectedPosesList.map((p) => p.product_image_id);
    
    try {
      const { error } = await supabase
        .from("product_images")
        .update({ slot: newSlot })
        .in("id", productImageIds);

      if (error) throw error;

      setClayPoses((prev) =>
        prev.map((p) =>
          selectedPoses.has(p.id) ? { ...p, slot: newSlot } : p
        )
      );
      toast.success(`Moved ${selectedPoses.size} poses to ${SLOT_LABELS[newSlot]}`);
      clearSelection();
    } catch (err) {
      console.error("Bulk move error:", err);
      toast.error("Failed to move poses");
    }
  };

  // AVA AI Check handler
  const handleAvaCheck = async () => {
    const brandId = selectedBrand !== "all" ? selectedBrand : null;
    
    setIsChecking(true);
    setCheckProgress({ current: 0, total: 0 });

    try {
      const { data, error } = await supabase.functions.invoke("organize-clay-poses", {
        body: { brandId },
      });

      if (error) throw error;

      if (data.total > 0) {
        setCheckJobId(data.jobId);
        setCheckProgress({ current: 0, total: data.total });
        toast.info(`AVA is checking ${data.total} clay poses...`);
      } else {
        toast.info("No clay poses to check!");
        setIsChecking(false);
      }
    } catch (err) {
      console.error("AVA check error:", err);
      toast.error("Failed to start AVA check");
      setIsChecking(false);
    }
  };

  // Filter poses by selected brand
  const getFilteredByBrand = () => {
    if (selectedBrand === "all") return clayPoses;
    return clayPoses.filter((pose) => pose.brand_id === selectedBrand);
  };

  const getFilteredPoses = (gender: string | null, productType: string | null, slot: string) => {
    return getFilteredByBrand().filter((pose) => {
      const genderMatch = gender === null 
        ? pose.gender === null 
        : pose.gender?.toLowerCase() === gender.toLowerCase();
      const typeMatch = productType === null 
        ? pose.product_type === null 
        : pose.product_type?.toLowerCase() === productType.toLowerCase();
      return genderMatch && typeMatch && pose.slot === slot;
    });
  };

  const getUncategorizedCount = () => {
    return getFilteredByBrand().filter(
      (p) => !p.gender || !p.product_type ||
        !GENDERS.includes((p.gender || "").toLowerCase() as any) ||
        !PRODUCT_TYPES.includes((p.product_type || "").toLowerCase() as any)
    ).length;
  };

  const getPosesBySlot = (slot: string) => {
    return getFilteredByBrand().filter((pose) => pose.slot === slot);
  };

  const filteredPoses = getFilteredByBrand();

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

  const renderPoseCard = (pose: ClayPoseItem) => {
    const isSelected = selectedPoses.has(pose.id);
    
    return (
      <div
        key={pose.id}
        className={`relative group cursor-pointer transition-all ${
          isSelected ? 'ring-2 ring-primary ring-offset-2 rounded' : ''
        }`}
        onClick={() => togglePoseSelection(pose.id)}
      >
        <img
          src={pose.stored_url}
          alt={`Clay pose ${pose.slot}`}
          className="w-full aspect-[3/4] object-cover rounded border bg-background"
        />
        <div className="absolute bottom-1 left-1 right-1 bg-background/80 text-xs px-1 py-0.5 rounded truncate">
          {pose.sku || pose.brand_name}
        </div>
        
        {/* Selection indicator */}
        <div className={`absolute top-1 left-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
            isSelected ? 'bg-primary text-primary-foreground' : 'bg-background/80 border'
          }`}>
            {isSelected && <CheckCircle2 className="w-3 h-3" />}
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowRightLeft className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {SLOTS.filter((s) => s !== pose.slot).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMovePose(pose.id, s);
                  }}
                >
                  Move to {s}: {SLOT_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="destructive"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              handleDeletePose(pose.id);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 space-y-4">
      {/* AVA Check Button */}
      <div className="space-y-2">
        <Button
          onClick={handleAvaCheck}
          disabled={isChecking}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 hover:from-violet-600 hover:via-fuchsia-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 border-0"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              AVA is checking... {checkProgress.total > 0 && `(${checkProgress.current}/${checkProgress.total})`}
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              ✨ AVA Check Placement
            </>
          )}
        </Button>
        
        {isChecking && checkProgress.total > 0 && (
          <div className="space-y-1">
            <Progress 
              value={(checkProgress.current / Math.max(checkProgress.total, 1)) * 100} 
              className="h-2 bg-violet-100"
            />
            <p className="text-xs text-muted-foreground text-center">
              Checking pose {checkProgress.current} of {checkProgress.total}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <User className="w-5 h-5" />
          Clay Pose Library
        </h2>
        <div className="flex items-center gap-3">
          {/* Brand Filter */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary">{filteredPoses.length} poses</Badge>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selectedPoses.size > 0 && (
        <Card className="p-3 sticky top-0 z-10 bg-background/95 backdrop-blur border-primary/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="text-sm">
                {selectedPoses.size} selected
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
                  {SLOTS.map((s) => (
                    <DropdownMenuItem key={s} onClick={() => handleBulkMove(s)}>
                      {s}: {SLOT_LABELS[s]}
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

      {uncategorizedCount > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {uncategorizedCount} pose{uncategorizedCount > 1 ? 's' : ''} need gender/product type classification. 
            New scrapes will auto-classify using AI vision.
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
              const allSelected = poses.length > 0 && poses.every((p) => selectedPoses.has(p.id));
              
              return (
                <div key={slot} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => selectAllInSlot(slot)}
                      >
                        {allSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </Button>
                      <span className="text-sm font-medium text-muted-foreground">
                        {slot}: {SLOT_LABELS[slot]}
                      </span>
                    </div>
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
                        poses.map((pose) => renderPoseCard(pose))
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
              const count = filteredPoses.filter(
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
                            {slot}: {SLOT_LABELS[slot]}
                          </div>
                          <ScrollArea className="h-48 border rounded-lg bg-muted/30">
                            <div className="p-2 space-y-2">
                              {poses.length === 0 ? (
                                <div className="text-xs text-muted-foreground text-center py-4">
                                  No poses
                                </div>
                              ) : (
                                poses.map((pose) => renderPoseCard(pose))
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
            {filteredPoses.filter(
              (p) =>
                p.gender?.toLowerCase() === gender.toLowerCase() &&
                (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
            ).length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-muted-foreground">Uncategorized (no product type)</h3>
                  <Badge variant="outline" className="text-xs">
                    {filteredPoses.filter(
                      (p) =>
                        p.gender?.toLowerCase() === gender.toLowerCase() &&
                        (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
                    ).length} images
                  </Badge>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {filteredPoses
                    .filter(
                      (p) =>
                        p.gender?.toLowerCase() === gender.toLowerCase() &&
                        (!p.product_type || !PRODUCT_TYPES.includes(p.product_type.toLowerCase() as any))
                    )
                    .map((pose) => renderPoseCard(pose))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
