import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Shirt, Layers } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useUpdateReposeBatchConfig } from "@/hooks/useReposeBatches";
import { useBrands } from "@/hooks/useBrands";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { useSearchParams } from "react-router-dom";
import type { ReposeConfig } from "@/types/repose";
import { CropTarget, CROP_TARGET_LABELS, ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS } from "@/types/shot-types";

interface BatchSetupPanelProps {
  batchId: string | undefined;
}

interface ClayPoseCount {
  brandId: string;
  brandName: string;
  total: number;
  FRONT_FULL: number;
  FRONT_CROPPED: number;
  DETAIL: number;
  BACK_FULL: number;
}

export function BatchSetupPanel({ batchId }: BatchSetupPanelProps) {
  const [, setSearchParams] = useSearchParams();
  
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);
  const updateConfig = useUpdateReposeBatchConfig();

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [posesPerShotType, setPosesPerShotType] = useState(2);
  const [cropTarget, setCropTarget] = useState<CropTarget>('top');
  const [clayPoseCounts, setClayPoseCounts] = useState<ClayPoseCount[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Load clay pose counts per brand
  useEffect(() => {
    async function loadCounts() {
      setLoadingCounts(true);
      try {
        const { data: clayImages } = await supabase
          .from("clay_images")
          .select(`
            id,
            product_image_id,
            product_images!inner(
              slot,
              shot_type,
              products!inner(
                brand_id,
                brands!inner(name)
              )
            )
          `);

        if (clayImages) {
          const countsByBrand: Record<string, ClayPoseCount> = {};
          
          clayImages.forEach((clay: any) => {
            const brandId = clay.product_images?.products?.brand_id;
            const brandName = clay.product_images?.products?.brands?.name;
            const slot = clay.product_images?.slot || '';
            const shotType = clay.product_images?.shot_type || 
              (slot === 'A' ? 'FRONT_FULL' : slot === 'B' ? 'FRONT_CROPPED' : slot === 'C' ? 'BACK_FULL' : slot === 'D' ? 'DETAIL' : '');

            if (!brandId) return;

            if (!countsByBrand[brandId]) {
              countsByBrand[brandId] = {
                brandId,
                brandName: brandName || 'Unknown',
                total: 0,
                FRONT_FULL: 0,
                FRONT_CROPPED: 0,
                DETAIL: 0,
                BACK_FULL: 0,
              };
            }

            countsByBrand[brandId].total++;
            if (shotType === 'FRONT_FULL') countsByBrand[brandId].FRONT_FULL++;
            else if (shotType === 'FRONT_CROPPED') countsByBrand[brandId].FRONT_CROPPED++;
            else if (shotType === 'DETAIL') countsByBrand[brandId].DETAIL++;
            else if (shotType === 'BACK_FULL') countsByBrand[brandId].BACK_FULL++;
          });

          setClayPoseCounts(Object.values(countsByBrand));
        }
      } catch (error) {
        console.error("Error loading clay pose counts:", error);
      }
      setLoadingCounts(false);
    }

    loadCounts();
  }, []);

  // Initialize from batch config
  useEffect(() => {
    if (batch) {
      if (batch.brand_id) setSelectedBrandId(batch.brand_id);
      const config = batch.config_json as ReposeConfig;
      if (config?.posesPerShotType) setPosesPerShotType(config.posesPerShotType);
      if (config?.cropTarget) setCropTarget(config.cropTarget);
    }
  }, [batch]);

  const selectedBrandCounts = clayPoseCounts.find(c => c.brandId === selectedBrandId);

  // Calculate estimated outputs
  const estimatedOutputs = useMemo(() => {
    if (!batchItems?.length || !selectedBrandCounts) return 0;
    // Simplified: items × poses per type × 4 output types (roughly)
    return batchItems.length * posesPerShotType * 4;
  }, [batchItems, selectedBrandCounts, posesPerShotType]);

  const handleSaveAndProceed = () => {
    if (!batchId) return;

    const config: ReposeConfig = {
      posesPerShotType,
      attemptsPerPose: 1,
      cropTarget,
    };

    updateConfig.mutate(
      { batchId, config, brandId: selectedBrandId || undefined },
      {
        onSuccess: () => {
          setSearchParams({ tab: 'generate' });
        },
      }
    );
  };

  if (batchLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LeapfrogLoader />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No batch selected. Please select a project first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Simple Setup Card */}
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Product Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Product Type</label>
              <div className="flex gap-2">
                <Button
                  variant={cropTarget === 'top' ? 'default' : 'outline'}
                  onClick={() => setCropTarget('top')}
                  className="flex-1 gap-2"
                >
                  <Shirt className="w-4 h-4" />
                  Top
                </Button>
                <Button
                  variant={cropTarget === 'trousers' ? 'default' : 'outline'}
                  onClick={() => setCropTarget('trousers')}
                  className="flex-1 gap-2"
                >
                  <Layers className="w-4 h-4" />
                  Trousers
                </Button>
              </div>
            </div>

            {/* Pose Library */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Pose Library</label>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a brand..." />
                </SelectTrigger>
                <SelectContent>
                  {clayPoseCounts.map((counts) => (
                    <SelectItem key={counts.brandId} value={counts.brandId}>
                      <div className="flex items-center gap-2">
                        <span>{counts.brandName}</span>
                        <Badge variant="outline" className="text-xs">
                          {counts.total} poses
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Renders per Look */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Renders per Look</label>
              <Select 
                value={posesPerShotType.toString()} 
                onValueChange={(v) => setPosesPerShotType(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(n => (
                    <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Brand pose breakdown - shown when brand selected */}
          {selectedBrandCounts && (
            <div className="mt-4 p-3 bg-secondary/30 rounded-lg">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{selectedBrandCounts.brandName}:</span>
                {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                  <span key={shotType} className="text-muted-foreground">
                    {OUTPUT_SHOT_LABELS[shotType]}: <span className="font-medium text-foreground">{selectedBrandCounts[shotType]}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Look Thumbnails */}
      <Card>
        <CardHeader>
          <CardTitle>Looks in Batch ({batchItems?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {batchItems && batchItems.length > 0 ? (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {batchItems.map((item) => (
                <div 
                  key={item.id} 
                  className="aspect-[3/4] bg-muted rounded-md overflow-hidden border"
                >
                  <img 
                    src={item.source_url} 
                    alt="Look thumbnail"
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No looks in this batch yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
        <div>
          <p className="text-sm text-muted-foreground">Estimated Outputs</p>
          <p className="text-2xl font-bold">{estimatedOutputs}</p>
        </div>
        <Button 
          onClick={handleSaveAndProceed}
          disabled={!selectedBrandId || updateConfig.isPending}
          size="lg"
          className="gap-2"
        >
          Generate {estimatedOutputs} Repose Images
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
