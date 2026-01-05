import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Palette, ArrowRight, Images, AlertCircle, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useReposeBatch, useReposeBatchItems, useUpdateReposeBatchConfig } from "@/hooks/useReposeBatches";
import { useBrands } from "@/hooks/useBrands";
import { supabase } from "@/integrations/supabase/client";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { useSearchParams } from "react-router-dom";
import type { ReposeConfig } from "@/types/repose";
import { 
  InputViewType, 
  OutputShotType, 
  ALL_OUTPUT_SHOT_TYPES,
  OUTPUT_SHOT_LABELS, 
  INPUT_VIEW_LABELS,
  CROP_TARGET_LABELS,
  CropTarget,
  parseViewToInputType,
  calculateOutputPlan,
  OutputPlanItem,
} from "@/types/shot-types";

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
  const { brands, loading: brandsLoading } = useBrands();
  const updateConfig = useUpdateReposeBatchConfig();

  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [posesPerShotType, setPosesPerShotType] = useState(2);
  const [attemptsPerPose, setAttemptsPerPose] = useState(1);
  const [cropTarget, setCropTarget] = useState<CropTarget>('top');
  const [clayPoseCounts, setClayPoseCounts] = useState<ClayPoseCount[]>([]);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Load clay pose counts per brand with new shot type mapping
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
      if (config?.attemptsPerPose) setAttemptsPerPose(config.attemptsPerPose);
      if (config?.cropTarget) setCropTarget(config.cropTarget);
    }
  }, [batch]);

  // Parse available inputs from batch items
  const availableInputs = useMemo(() => {
    const inputs = new Set<InputViewType>();
    batchItems?.forEach(item => {
      const inputType = parseViewToInputType(item.view);
      if (inputType) inputs.add(inputType);
    });
    return Array.from(inputs);
  }, [batchItems]);

  // Count items by input type
  const inputCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    batchItems?.forEach(item => {
      const inputType = parseViewToInputType(item.view);
      if (inputType) {
        counts[inputType] = (counts[inputType] || 0) + 1;
      }
    });
    return counts;
  }, [batchItems]);

  // Calculate output plan based on available inputs
  const outputPlan = useMemo(() => calculateOutputPlan(availableInputs), [availableInputs]);

  const selectedBrandCounts = clayPoseCounts.find(c => c.brandId === selectedBrandId);

  // Calculate estimated outputs using the new shot type system
  const calculateEstimatedOutputs = () => {
    if (!batchItems || !selectedBrandCounts) return 0;

    let total = 0;

    batchItems.forEach(item => {
      const inputType = parseViewToInputType(item.view);
      if (!inputType) return;

      // Each input can produce specific outputs based on enforced rules
      outputPlan.forEach(planItem => {
        if (!planItem.canGenerate) return;
        if (planItem.source !== inputType && !(planItem.isDerived && inputType === 'INPUT_FRONT_FULL')) return;

        const poseCount = selectedBrandCounts[planItem.shotType] || 0;
        const posesToUse = Math.min(posesPerShotType, poseCount);
        total += posesToUse * attemptsPerPose;
      });
    });

    return total;
  };

  const handleSaveAndProceed = () => {
    if (!batchId) return;

    const config: ReposeConfig = {
      posesPerShotType,
      attemptsPerPose,
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
        <p>No batch selected. Please select a job first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Input Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="w-5 h-5" />
            Input Coverage
          </CardTitle>
          <CardDescription>
            Available inputs from the selected job
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['INPUT_FRONT_FULL', 'INPUT_BACK_FULL', 'INPUT_DETAIL', 'INPUT_SIDE'] as InputViewType[]).map((inputType) => {
              const count = inputCounts[inputType] || 0;
              const isAvailable = count > 0;
              const label = INPUT_VIEW_LABELS[inputType];
              
              return (
                <div 
                  key={inputType}
                  className={`p-4 rounded-lg border ${isAvailable ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/50 border-muted'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {isAvailable ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${isAvailable ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {count}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Output Plan (Auto-calculated) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Output Plan
          </CardTitle>
          <CardDescription>
            Automatically determined based on available inputs and camera rules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {outputPlan.map((item) => (
              <div 
                key={item.shotType}
                className={`p-4 rounded-lg border ${item.canGenerate ? 'bg-background border-border' : 'bg-muted/30 border-muted'}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {item.canGenerate ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.canGenerate ? item.sourceLabel : item.missingReason}
                    </p>
                    
                    {/* Crop target selector for FRONT_CROPPED */}
                    {item.shotType === 'FRONT_CROPPED' && item.canGenerate && (
                      <div className="mt-3">
                        <label className="text-xs text-muted-foreground block mb-1">Crop Target</label>
                        <div className="flex gap-2">
                          {(['top', 'trousers'] as CropTarget[]).map((target) => (
                            <Button
                              key={target}
                              size="sm"
                              variant={cropTarget === target ? "default" : "outline"}
                              onClick={() => setCropTarget(target)}
                            >
                              {CROP_TARGET_LABELS[target]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {item.isDerived && (
                    <Badge variant="outline" className="text-xs">Derived</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Warning for missing inputs */}
          {outputPlan.some(item => !item.canGenerate) && (
            <Alert>
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>
                Some outputs cannot be generated due to missing inputs. Only available outputs will be produced.
              </AlertDescription>
            </Alert>
          )}
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
                {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                  <div key={shotType}>
                    <span className="text-muted-foreground">{OUTPUT_SHOT_LABELS[shotType]}:</span>{' '}
                    <span className="font-medium">{selectedBrandCounts[shotType]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Poses Per Shot Type</label>
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
