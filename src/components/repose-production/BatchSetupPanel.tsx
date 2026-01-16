import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, AlertCircle, Shirt, Layers } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useUpdateReposeBatchConfig } from "@/hooks/useReposeBatches";
import { useUpdateLookProductType } from "@/hooks/useProductionProjects";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ReposeConfig } from "@/types/repose";
import { ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS } from "@/types/shot-types";

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

interface LookGroup {
  lookId: string;
  lookName: string;
  productType: 'top' | 'trousers' | null;
  views: Array<{ view: string; sourceUrl: string }>;
}

export function BatchSetupPanel({ batchId }: BatchSetupPanelProps) {
  const [, setSearchParams] = useSearchParams();
  
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);
  const updateConfig = useUpdateReposeBatchConfig();
  const updateLookProductType = useUpdateLookProductType();

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [posesPerShotType, setPosesPerShotType] = useState(2);
  const [clayPoseCounts, setClayPoseCounts] = useState<ClayPoseCount[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Look up look_id via source_output_id for items with missing look_id
  const { data: outputLookMap } = useQuery({
    queryKey: ["batch-output-look-map", batchItems?.map(i => i.source_output_id).filter(Boolean)],
    queryFn: async () => {
      const outputIds = batchItems?.map(i => i.source_output_id).filter(Boolean) as string[];
      if (outputIds.length === 0) return {};
      
      const { data } = await supabase
        .from("job_outputs")
        .select("id, job:unified_jobs(look_id)")
        .in("id", outputIds);
      
      // Build a map: source_output_id -> look_id
      const map: Record<string, string> = {};
      data?.forEach((output: any) => {
        if (output.job?.look_id) {
          map[output.id] = output.job.look_id;
        }
      });
      return map;
    },
    enabled: !!batchItems && batchItems.some(i => !i.look_id && i.source_output_id),
  });

  // Get unique look IDs from batch items (including fallback from output lookup)
  const lookIds = useMemo(() => {
    if (!batchItems?.length) return [];
    const ids = new Set<string>();
    batchItems.forEach(i => {
      if (i.look_id) {
        ids.add(i.look_id);
      } else if (outputLookMap?.[i.source_output_id || '']) {
        ids.add(outputLookMap[i.source_output_id || '']);
      }
    });
    return [...ids];
  }, [batchItems, outputLookMap]);

  // Fetch look details (names and product types) for items in batch
  const { data: lookDetails } = useQuery({
    queryKey: ["batch-look-details", lookIds],
    queryFn: async () => {
      if (lookIds.length === 0) return [];
      const { data } = await supabase
        .from("talent_looks")
        .select("id, name, product_type")
        .in("id", lookIds);
      return data || [];
    },
    enabled: lookIds.length > 0,
  });

  // Group batch items by look
  const lookGroups = useMemo((): LookGroup[] => {
    if (!batchItems?.length) return [];
    
    const grouped = new Map<string, LookGroup>();
    
    batchItems.forEach(item => {
      // Use look_id from item, or fall back to the output lookup
      const lookId = item.look_id || outputLookMap?.[item.source_output_id || ''] || 'unknown';
      
      if (!grouped.has(lookId)) {
        const lookDetail = lookDetails?.find(l => l.id === lookId);
        grouped.set(lookId, {
          lookId,
          lookName: lookDetail?.name || 'Unknown Look',
          productType: (lookDetail?.product_type as 'top' | 'trousers' | null) || null,
          views: [],
        });
      }
      grouped.get(lookId)!.views.push({
        view: item.view,
        sourceUrl: item.source_url,
      });
    });
    
    return Array.from(grouped.values());
  }, [batchItems, lookDetails, outputLookMap]);

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
    }
  }, [batch]);

  const selectedBrandCounts = clayPoseCounts.find(c => c.brandId === selectedBrandId);

  // Calculate estimated outputs based on unique looks (not individual images)
  const estimatedOutputs = useMemo(() => {
    if (!lookGroups.length || !selectedBrandCounts) return 0;
    // looks × 4 output types × poses per type
    return lookGroups.length * 4 * posesPerShotType;
  }, [lookGroups, selectedBrandCounts, posesPerShotType]);

  // Check if all looks have product type set
  const allLooksHaveProductType = lookGroups.every(l => l.productType !== null);
  const looksWithoutProductType = lookGroups.filter(l => l.productType === null).length;

  const handleProductTypeChange = (lookId: string, productType: 'top' | 'trousers') => {
    updateLookProductType.mutate({ lookId, productType });
  };

  // Bulk set all looks to same product type
  const handleBulkSetProductType = (productType: 'top' | 'trousers') => {
    lookGroups.forEach(look => {
      if (look.lookId !== 'unknown') {
        updateLookProductType.mutate({ lookId: look.lookId, productType });
      }
    });
  };

  const handleSaveAndProceed = () => {
    if (!batchId) return;

    const config: ReposeConfig = {
      posesPerShotType,
      attemptsPerPose: 1,
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
      {/* Setup Card - Pose Library & Renders */}
      <Card>
        <CardHeader>
          <CardTitle>Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

          {/* Brand pose breakdown */}
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

      {/* Looks with Per-Look Product Type */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Looks in Batch ({lookGroups.length})</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Set all to:</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkSetProductType('top')}
                className="gap-1"
              >
                <Shirt className="w-3 h-3" />
                Tops
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkSetProductType('trousers')}
                className="gap-1"
              >
                <Layers className="w-3 h-3" />
                Trousers
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {lookGroups.length > 0 ? (
            <div className="space-y-3">
              {lookGroups.map((look) => (
                <div 
                  key={look.lookId}
                  className="flex items-center gap-4 p-3 border rounded-lg bg-card"
                >
                  {/* Look Name */}
                  <div className="w-48 flex-shrink-0">
                    <p className="font-medium truncate">{look.lookName}</p>
                    <p className="text-xs text-muted-foreground">{look.views.length} views</p>
                  </div>

                  {/* View Thumbnails */}
                  <div className="flex gap-2 flex-1">
                    {look.views.map((v, i) => (
                      <div 
                        key={i} 
                        className="w-12 h-16 bg-muted rounded overflow-hidden border flex-shrink-0"
                        title={v.view}
                      >
                        <img 
                          src={v.sourceUrl} 
                          alt={v.view}
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    ))}
                  </div>

                  {/* Product Type Toggle */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant={look.productType === 'top' ? 'default' : 'outline'}
                      onClick={() => handleProductTypeChange(look.lookId, 'top')}
                      className="gap-1"
                      disabled={look.lookId === 'unknown'}
                    >
                      <Shirt className="w-3 h-3" />
                      Top
                    </Button>
                    <Button
                      size="sm"
                      variant={look.productType === 'trousers' ? 'default' : 'outline'}
                      onClick={() => handleProductTypeChange(look.lookId, 'trousers')}
                      className="gap-1"
                      disabled={look.lookId === 'unknown'}
                    >
                      <Layers className="w-3 h-3" />
                      Trousers
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No looks in this batch yet.</p>
          )}

          {looksWithoutProductType > 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4 inline-block mr-2" />
              {looksWithoutProductType} look{looksWithoutProductType > 1 ? 's' : ''} need{looksWithoutProductType === 1 ? 's' : ''} a product type (Top/Trousers) assigned.
            </div>
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
          disabled={!selectedBrandId || !allLooksHaveProductType || updateConfig.isPending}
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
