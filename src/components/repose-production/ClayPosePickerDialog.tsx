import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutputShotType } from "@/types/shot-types";

interface ClayPose {
  id: string;
  stored_url: string;
  slot: string;
  gender: string | null;
  product_type: string | null;
}

interface ClayPosePickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAndRerender: (poseId: string, poseUrl: string, resolution: '2K' | '4K') => void;
  currentShotType: OutputShotType | string;
  batchId: string;
}

const SHOT_TYPE_TO_SLOT: Record<string, string> = {
  'FRONT_FULL': 'A',
  'FRONT_CROPPED': 'B',
  'DETAIL': 'D',
  'BACK_FULL': 'C',
};

const SLOT_TO_SHOT_TYPE: Record<string, string> = {
  'A': 'FRONT_FULL',
  'B': 'FRONT_CROPPED',
  'D': 'DETAIL',
  'C': 'BACK_FULL',
};

export function ClayPosePickerDialog({
  isOpen,
  onClose,
  onSelectAndRerender,
  currentShotType,
  batchId,
}: ClayPosePickerDialogProps) {
  const [poses, setPoses] = useState<ClayPose[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPose, setSelectedPose] = useState<ClayPose | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<'2K' | '4K'>('4K');
  const [applying, setApplying] = useState(false);
  
  // Filters
  const [shotTypeFilter, setShotTypeFilter] = useState<string>(currentShotType);
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [productTypeFilter, setProductTypeFilter] = useState<string>('all');

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPose(null);
      setShotTypeFilter(currentShotType);
    }
  }, [isOpen, currentShotType]);

  // Fetch clay poses for the batch's brand
  useEffect(() => {
    if (!isOpen || !batchId) return;
    
    const fetchPoses = async () => {
      setLoading(true);
      try {
        // First get the brand_id from the batch
        const { data: batch } = await supabase
          .from("repose_batches")
          .select("brand_id")
          .eq("id", batchId)
          .single();
        
        if (!batch?.brand_id) {
          console.error("No brand_id found for batch");
          return;
        }

        // Fetch clay images for this brand
        const { data: clayImages, error } = await supabase
          .from("clay_images")
          .select(`
            id,
            stored_url,
            product_images!inner (
              slot,
              products!inner (
                gender,
                product_type,
                brand_id
              )
            )
          `)
          .eq("product_images.products.brand_id", batch.brand_id);

        if (error) {
          console.error("Error fetching clay poses:", error);
          return;
        }

        // Transform the data
        const transformed: ClayPose[] = (clayImages || []).map((ci: any) => ({
          id: ci.id,
          stored_url: ci.stored_url,
          slot: ci.product_images?.slot || '',
          gender: ci.product_images?.products?.gender || null,
          product_type: ci.product_images?.products?.product_type || null,
        }));

        setPoses(transformed);
      } catch (err) {
        console.error("Error fetching poses:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPoses();
  }, [isOpen, batchId]);

  // Filter poses based on selected filters
  const filteredPoses = useMemo(() => {
    let result = poses;

    // Filter by shot type (slot)
    if (shotTypeFilter && shotTypeFilter !== 'all') {
      const targetSlot = SHOT_TYPE_TO_SLOT[shotTypeFilter];
      if (targetSlot) {
        result = result.filter(p => p.slot === targetSlot);
      }
    }

    // Filter by gender
    if (genderFilter && genderFilter !== 'all') {
      result = result.filter(p => p.gender === genderFilter);
    }

    // Filter by product type
    if (productTypeFilter && productTypeFilter !== 'all') {
      result = result.filter(p => p.product_type === productTypeFilter);
    }

    return result;
  }, [poses, shotTypeFilter, genderFilter, productTypeFilter]);

  // Get unique values for filter dropdowns
  const uniqueGenders = useMemo(() => 
    [...new Set(poses.map(p => p.gender).filter(Boolean))] as string[],
    [poses]
  );
  
  const uniqueProductTypes = useMemo(() => 
    [...new Set(poses.map(p => p.product_type).filter(Boolean))] as string[],
    [poses]
  );

  const handleApply = async () => {
    if (!selectedPose) return;
    setApplying(true);
    try {
      await onSelectAndRerender(selectedPose.id, selectedPose.stored_url, selectedResolution);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select Clay Pose</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Shot Type:</span>
            <Select value={shotTypeFilter} onValueChange={setShotTypeFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="FRONT_FULL">Full Front</SelectItem>
                <SelectItem value="FRONT_CROPPED">Front Cropped</SelectItem>
                <SelectItem value="BACK_FULL">Back</SelectItem>
                <SelectItem value="DETAIL">Detail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Gender:</span>
            <Select value={genderFilter} onValueChange={setGenderFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {uniqueGenders.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Product:</span>
            <Select value={productTypeFilter} onValueChange={setProductTypeFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {uniqueProductTypes.map(pt => (
                  <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">Resolution:</span>
            <Select value={selectedResolution} onValueChange={(v) => setSelectedResolution(v as '2K' | '4K')}>
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2K">2K</SelectItem>
                <SelectItem value="4K">4K</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pose Grid */}
        <ScrollArea className="h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPoses.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No poses found matching filters
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 p-2">
              {filteredPoses.map((pose) => (
                <button
                  key={pose.id}
                  onClick={() => setSelectedPose(pose)}
                  className={cn(
                    "relative aspect-[3/4] rounded-md overflow-hidden border-2 transition-all hover:opacity-90",
                    selectedPose?.id === pose.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img
                    src={pose.stored_url}
                    alt="Clay pose"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedPose?.id === pose.id && (
                    <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
                    {SLOT_TO_SHOT_TYPE[pose.slot] || pose.slot}
                    {pose.gender && ` · ${pose.gender}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            {filteredPoses.length} pose{filteredPoses.length !== 1 ? 's' : ''} available
            {selectedPose && " · 1 selected"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={applying}>
              Cancel
            </Button>
            <Button 
              onClick={handleApply} 
              disabled={!selectedPose || applying}
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                `Apply & Re-render at ${selectedResolution}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}