import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Settings, Palette, ArrowRight, Images, AlertCircle } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useUpdateReposeBatchConfig } from "@/hooks/useReposeBatches";
import { useBrands } from "@/hooks/useBrands";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ReposeConfig, PairingRules, DEFAULT_PAIRING_RULES, DEFAULT_REPOSE_CONFIG } from "@/types/repose";

interface BatchSetupPanelProps {
  batchId: string | undefined;
}

interface ClayPoseCount {
  brandId: string;
  brandName: string;
  total: number;
  slotA: number;
  slotB: number;
  slotC: number;
  slotD: number;
}

export function BatchSetupPanel({ batchId }: BatchSetupPanelProps) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems, isLoading: itemsLoading } = useReposeBatchItems(batchId);
  const { brands, loading: brandsLoading } = useBrands();
  const updateConfig = useUpdateReposeBatchConfig();

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [randomPosesPerSlot, setRandomPosesPerSlot] = useState(2);
  const [attemptsPerPose, setAttemptsPerPose] = useState(1);
  const [pairingRules, setPairingRules] = useState<PairingRules>({
    frontToSlotA: true,
    frontToSlotB: true,
    backToSlotC: true,
    detailToSlotD: true,
    sideToSlotB: false,
  });
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
            const slot = clay.product_images?.slot || 'unknown';

            if (!brandId) return;

            if (!countsByBrand[brandId]) {
              countsByBrand[brandId] = {
                brandId,
                brandName: brandName || 'Unknown',
                total: 0,
                slotA: 0,
                slotB: 0,
                slotC: 0,
                slotD: 0,
              };
            }

            countsByBrand[brandId].total++;
            if (slot === 'A') countsByBrand[brandId].slotA++;
            else if (slot === 'B') countsByBrand[brandId].slotB++;
            else if (slot === 'C') countsByBrand[brandId].slotC++;
            else if (slot === 'D') countsByBrand[brandId].slotD++;
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
      if (config?.randomPosesPerSlot) setRandomPosesPerSlot(config.randomPosesPerSlot);
      if (config?.attemptsPerPose) setAttemptsPerPose(config.attemptsPerPose);
      if (config?.pairingRules) setPairingRules(config.pairingRules);
    }
  }, [batch]);

  // Count views in batch items
  const viewCounts = batchItems?.reduce((acc, item) => {
    const view = item.view.toLowerCase();
    acc[view] = (acc[view] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const selectedBrandCounts = clayPoseCounts.find(c => c.brandId === selectedBrandId);

  // Calculate estimated outputs
  const calculateEstimatedOutputs = () => {
    if (!batchItems || !selectedBrandCounts) return 0;

    let total = 0;
    const rules = pairingRules;

    batchItems.forEach(item => {
      const view = item.view.toLowerCase();
      let posesForView = 0;

      if (view === 'front') {
        if (rules.frontToSlotA) posesForView += Math.min(randomPosesPerSlot, selectedBrandCounts.slotA);
        if (rules.frontToSlotB) posesForView += Math.min(randomPosesPerSlot, selectedBrandCounts.slotB);
      } else if (view === 'back') {
        if (rules.backToSlotC) posesForView += Math.min(randomPosesPerSlot, selectedBrandCounts.slotC);
      } else if (view === 'detail') {
        if (rules.detailToSlotD) posesForView += Math.min(randomPosesPerSlot, selectedBrandCounts.slotD);
      } else if (view === 'side') {
        if (rules.sideToSlotB) posesForView += Math.min(randomPosesPerSlot, selectedBrandCounts.slotB);
      }

      total += posesForView * attemptsPerPose;
    });

    return total;
  };

  const handleSaveAndProceed = () => {
    if (!batchId) return;

    const config: ReposeConfig = {
      randomPosesPerSlot,
      attemptsPerPose,
      pairingRules,
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
        <p>No batch selected. Please select a job first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="w-5 h-5" />
            Batch Overview
          </CardTitle>
          <CardDescription>
            Approved outputs from the selected job
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold">{batchItems?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Front Views</p>
              <p className="text-2xl font-bold">{viewCounts['front'] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Back Views</p>
              <p className="text-2xl font-bold">{viewCounts['back'] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Side Views</p>
              <p className="text-2xl font-bold">{viewCounts['side'] || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Detail Views</p>
              <p className="text-2xl font-bold">{viewCounts['detail'] || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand Pose Library Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Select Brand Pose Library
          </CardTitle>
          <CardDescription>
            Choose the clay pose library to apply to this batch
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {selectedBrandCounts && (
            <div className="p-4 bg-secondary/30 rounded-lg">
              <p className="text-sm font-medium mb-2">{selectedBrandCounts.brandName} - Pose Distribution</p>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Slot A:</span> {selectedBrandCounts.slotA}
                </div>
                <div>
                  <span className="text-muted-foreground">Slot B:</span> {selectedBrandCounts.slotB}
                </div>
                <div>
                  <span className="text-muted-foreground">Slot C:</span> {selectedBrandCounts.slotC}
                </div>
                <div>
                  <span className="text-muted-foreground">Slot D:</span> {selectedBrandCounts.slotD}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pairing Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Pairing Rules
          </CardTitle>
          <CardDescription>
            Configure how views map to pose slots
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="frontA" 
                checked={pairingRules.frontToSlotA}
                onCheckedChange={(checked) => setPairingRules(p => ({ ...p, frontToSlotA: !!checked }))}
              />
              <label htmlFor="frontA" className="text-sm">FRONT view → Slot A (Full Front)</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="frontB" 
                checked={pairingRules.frontToSlotB}
                onCheckedChange={(checked) => setPairingRules(p => ({ ...p, frontToSlotB: !!checked }))}
              />
              <label htmlFor="frontB" className="text-sm">FRONT view → Slot B (Cropped Front)</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="backC" 
                checked={pairingRules.backToSlotC}
                onCheckedChange={(checked) => setPairingRules(p => ({ ...p, backToSlotC: !!checked }))}
              />
              <label htmlFor="backC" className="text-sm">BACK view → Slot C (Full Back)</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="detailD" 
                checked={pairingRules.detailToSlotD}
                onCheckedChange={(checked) => setPairingRules(p => ({ ...p, detailToSlotD: !!checked }))}
              />
              <label htmlFor="detailD" className="text-sm">DETAIL view → Slot D (Detail)</label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="sideB" 
                checked={pairingRules.sideToSlotB}
                onCheckedChange={(checked) => setPairingRules(p => ({ ...p, sideToSlotB: !!checked }))}
              />
              <label htmlFor="sideB" className="text-sm">SIDE view → Slot B (Cropped Front)</label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <label className="text-sm font-medium">Random Poses Per Slot</label>
              <Select 
                value={randomPosesPerSlot.toString()} 
                onValueChange={(v) => setRandomPosesPerSlot(parseInt(v))}
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Attempts Per Pose</label>
              <Select 
                value={attemptsPerPose.toString()} 
                onValueChange={(v) => setAttemptsPerPose(parseInt(v))}
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
        </CardContent>
      </Card>

      {/* Estimated Output */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Estimated Total Outputs</p>
              <p className="text-3xl font-bold">{calculateEstimatedOutputs()}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Based on {batchItems?.length || 0} items × selected poses × {attemptsPerPose} attempt(s)
              </p>
            </div>
            <Button 
              onClick={handleSaveAndProceed}
              disabled={!selectedBrandId || updateConfig.isPending}
              size="lg"
              className="gap-2"
            >
              Save & Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
