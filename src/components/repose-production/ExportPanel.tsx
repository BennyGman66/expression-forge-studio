import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Send, AlertCircle, CheckCircle2, FolderTree, Package } from "lucide-react";
import { useReposeBatch, useReposeBatchItems } from "@/hooks/useReposeBatches";
import { useReposeSelection } from "@/hooks/useReposeSelection";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, slotToShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import { SHOT_TYPE_FOLDER_NAMES, MAX_FAVORITES_PER_VIEW } from "@/types/repose";
import type { ReposeOutput } from "@/types/repose";
import JSZip from "jszip";

interface ExportPanelProps {
  batchId: string | undefined;
}

interface ExportItem {
  lookCode: string;
  shotType: OutputShotType;
  rank: 1 | 2 | 3;
  url: string;
  filename: string;
}

export function ExportPanel({ batchId }: ExportPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { data: batchItems } = useReposeBatchItems(batchId);
  const { outputs, groupedByLook, overallStats, getFavoritesForExport } = useReposeSelection(batchId);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Build export structure
  const exportStructure = useMemo(() => {
    const structure: Record<string, Record<OutputShotType, ExportItem[]>> = {};
    
    for (const look of groupedByLook) {
      const lookCode = look.lookCode.replace(/\s+/g, '_').toUpperCase();
      structure[lookCode] = {} as Record<OutputShotType, ExportItem[]>;

      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const viewOutputs = look.outputsByView[shotType] || [];
        const favorites = viewOutputs
          .filter(o => o.is_favorite && o.result_url && o.favorite_rank)
          .sort((a, b) => (a.favorite_rank || 0) - (b.favorite_rank || 0));

        if (favorites.length > 0) {
          structure[lookCode][shotType] = favorites.map((output) => {
            const folderName = SHOT_TYPE_FOLDER_NAMES[shotType];
            const rank = output.favorite_rank!;
            const filename = `${lookCode}_${folderName}_0${rank}.png`;
            
            return {
              lookCode,
              shotType,
              rank,
              url: output.result_url!,
              filename,
            };
          });
        }
      }
    }

    return structure;
  }, [groupedByLook]);

  // Calculate export stats
  const exportStats = useMemo(() => {
    let totalImages = 0;
    let totalLooks = 0;
    const lookCompleteness: Array<{ look: string; complete: number; total: number }> = [];

    for (const [lookCode, views] of Object.entries(exportStructure)) {
      const viewsWithSelections = Object.values(views).filter(items => items.length > 0);
      const completedViews = viewsWithSelections.filter(items => items.length >= MAX_FAVORITES_PER_VIEW);
      
      totalLooks++;
      totalImages += viewsWithSelections.reduce((sum, items) => sum + items.length, 0);
      
      lookCompleteness.push({
        look: lookCode,
        complete: completedViews.length,
        total: viewsWithSelections.length,
      });
    }

    return { totalImages, totalLooks, lookCompleteness };
  }, [exportStructure]);

  // Handle ZIP export
  const handleExportZip = async () => {
    if (exportStats.totalImages === 0) {
      toast.error("No selections to export");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const zip = new JSZip();
      let processed = 0;

      for (const [lookCode, views] of Object.entries(exportStructure)) {
        // Create look folder
        const lookFolder = zip.folder(lookCode);
        if (!lookFolder) continue;

        for (const [shotType, items] of Object.entries(views)) {
          // Create view subfolder
          const folderName = SHOT_TYPE_FOLDER_NAMES[shotType as OutputShotType];
          const viewFolder = lookFolder.folder(folderName);
          if (!viewFolder) continue;

          for (const item of items) {
            try {
              // Fetch image
              const response = await fetch(item.url);
              if (!response.ok) throw new Error(`Failed to fetch ${item.filename}`);
              
              const blob = await response.blob();
              viewFolder.file(item.filename, blob);
              
              processed++;
              setExportProgress((processed / exportStats.totalImages) * 100);
            } catch (error) {
              console.error(`Failed to add ${item.filename}:`, error);
            }
          }
        }
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ 
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repose_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${exportStats.totalImages} images`);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleSendToClientReview = () => {
    toast.info("Send to Client Review functionality coming soon");
  };

  if (batchLoading) {
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
        <p>Batch not found.</p>
      </div>
    );
  }

  const hasSelections = exportStats.totalImages > 0;
  const isComplete = overallStats.isAllComplete;

  return (
    <div className="space-y-6">
      {/* Export Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Export Package
          </CardTitle>
          <CardDescription>
            Download selected images organized by SKU and view
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Looks</p>
              <p className="text-2xl font-bold">{exportStats.totalLooks}</p>
            </div>
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-primary mb-1">
                <CheckCircle2 className="w-3 h-3" />
                <span className="text-xs">Images Selected</span>
              </div>
              <p className="text-2xl font-bold text-primary">{exportStats.totalImages}</p>
            </div>
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <Badge variant={isComplete ? "default" : "secondary"}>
                {isComplete ? "Complete" : "In Progress"}
              </Badge>
            </div>
            <div className="text-center p-4 bg-secondary/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Format</p>
              <p className="text-sm font-medium">ZIP (PNG)</p>
            </div>
          </div>

          {/* Export Progress */}
          {isExporting && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Preparing export...</span>
                <span className="text-sm text-muted-foreground">{Math.round(exportProgress)}%</span>
              </div>
              <Progress value={exportProgress} className="h-2" />
            </div>
          )}

          {/* Export Actions */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button 
              onClick={handleExportZip}
              disabled={!hasSelections || isExporting}
              className="flex-1 gap-2"
              size="lg"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting...' : `Download ZIP (${exportStats.totalImages} images)`}
            </Button>
            <Button 
              onClick={handleSendToClientReview}
              variant="outline"
              disabled={!hasSelections || isExporting}
              className="flex-1 gap-2"
              size="lg"
            >
              <Send className="w-4 h-4" />
              Send to Client Review
            </Button>
          </div>

          {!isComplete && hasSelections && (
            <p className="text-sm text-amber-500 mt-4 text-center">
              ⚠️ Some views have incomplete selections. Export will include only selected images.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Folder Structure Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="w-4 h-4" />
            Export Structure
          </CardTitle>
          <CardDescription>
            Preview of the folder hierarchy in the ZIP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="font-mono text-sm bg-secondary/30 rounded-lg p-4 max-h-80 overflow-auto">
            {Object.entries(exportStructure).map(([lookCode, views]) => (
              <div key={lookCode} className="mb-3">
                <div className="text-foreground font-medium">📁 {lookCode}/</div>
                {Object.entries(views).map(([shotType, items]) => {
                  if (items.length === 0) return null;
                  const folderName = SHOT_TYPE_FOLDER_NAMES[shotType as OutputShotType];
                  return (
                    <div key={shotType} className="ml-4">
                      <div className="text-muted-foreground">📁 {folderName}/</div>
                      {items.map((item) => (
                        <div key={item.filename} className="ml-4 text-muted-foreground/70">
                          📄 {item.filename}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
            {Object.keys(exportStructure).length === 0 && (
              <div className="text-muted-foreground text-center py-4">
                No selections yet. Select favorites in the Review tab first.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
