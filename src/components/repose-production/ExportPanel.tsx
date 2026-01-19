import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, CheckCircle2, Circle, AlertCircle, Lock, Check } from "lucide-react";
import { useReposeBatch, useMarkLooksExported } from "@/hooks/useReposeBatches";
import { useReposeSelection, LookWithOutputs } from "@/hooks/useReposeSelection";
import { LeapfrogLoader } from "@/components/ui/LeapfrogLoader";
import { toast } from "sonner";
import { ALL_OUTPUT_SHOT_TYPES, OutputShotType, OUTPUT_SHOT_LABELS } from "@/types/shot-types";
import { MAX_FAVORITES_PER_VIEW } from "@/types/repose";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import leapfrogLogo from "@/assets/leapfrog-logo.png";

interface ExportPanelProps {
  batchId: string | undefined;
}

// Map shot types to file suffixes
const SHOT_TYPE_SUFFIXES: Record<OutputShotType, string> = {
  FRONT_FULL: 'front',
  FRONT_CROPPED: 'crop_front',
  DETAIL: 'detail',
  BACK_FULL: 'back',
};

export function ExportPanel({ batchId }: ExportPanelProps) {
  const { data: batch, isLoading: batchLoading } = useReposeBatch(batchId);
  const { outputs, groupedByLook, overallStats, isLoading } = useReposeSelection(batchId);
  const markExported = useMarkLooksExported();

  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>("");

  // Determine which looks are export-ready (all 4 views have 3/3 selections)
  const { readyLooks, incompleteLooks } = useMemo(() => {
    const ready: LookWithOutputs[] = [];
    const incomplete: LookWithOutputs[] = [];

    for (const look of groupedByLook) {
      // Check all 4 shot types have 3 selections
      let allComplete = true;
      for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
        const stats = look.selectionStats.byView[shotType];
        if (!stats || stats.selected < MAX_FAVORITES_PER_VIEW) {
          allComplete = false;
          break;
        }
      }
      if (allComplete) {
        ready.push(look);
      } else {
        incomplete.push(look);
      }
    }

    return { readyLooks: ready, incompleteLooks: incomplete };
  }, [groupedByLook]);

  // Toggle look selection
  const toggleLookSelection = useCallback((lookId: string) => {
    setSelectedLookIds(prev => {
      const next = new Set(prev);
      if (next.has(lookId)) {
        next.delete(lookId);
      } else {
        next.add(lookId);
      }
      return next;
    });
  }, []);

  // Select all ready looks
  const selectAllReady = useCallback(() => {
    setSelectedLookIds(new Set(readyLooks.map(l => l.lookId)));
  }, [readyLooks]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedLookIds(new Set());
  }, []);

  // Get looks to export
  const looksToExport = useMemo(() => {
    if (selectedLookIds.size === 0) return [];
    return readyLooks.filter(l => selectedLookIds.has(l.lookId));
  }, [readyLooks, selectedLookIds]);

  // Create branded PNG slide using canvas
  const createSlide = useCallback(async (
    lookCode: string,
    shotType: OutputShotType,
    imageUrls: string[]
  ): Promise<Blob> => {
    // Canvas dimensions (landscape 16:9)
    const width = 1920;
    const height = 1080;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    
    // Background - soft neutral
    ctx.fillStyle = '#FAF9F7';
    ctx.fillRect(0, 0, width, height);
    
    // Load and draw logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = leapfrogLogo;
      });
      // Logo in top-left, 60px height
      const logoHeight = 60;
      const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
      ctx.drawImage(logoImg, 40, 25, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Failed to load logo:', e);
    }

    // Product code - top right
    ctx.fillStyle = '#1A1A1A';
    ctx.font = 'bold 36px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(lookCode, width - 40, 55);

    // Shot type label - below product code
    ctx.fillStyle = '#666666';
    ctx.font = '24px Inter, sans-serif';
    ctx.fillText(OUTPUT_SHOT_LABELS[shotType], width - 40, 85);

    // Load images and get their dimensions
    const images: HTMLImageElement[] = [];
    for (const url of imageUrls) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        images.push(img);
      } catch (e) {
        console.warn('Failed to load image:', url, e);
      }
    }

    // Layout: All images same size, uniform frames
    const headerHeight = 100;
    const footerHeight = 50;
    const margin = 60;
    const spacing = 30;
    
    // Available area for images
    const availableHeight = height - headerHeight - footerHeight - (margin * 2);
    const availableWidth = width - (margin * 2) - (spacing * 2);
    
    // Fixed frame size for all 3 images (uniform)
    const frameWidth = Math.floor(availableWidth / 3);
    const frameHeight = availableHeight;
    
    // Calculate starting position to center all 3 frames
    const totalFrameWidth = (frameWidth * 3) + (spacing * 2);
    const startX = (width - totalFrameWidth) / 2;
    const startY = headerHeight + margin;

    // Draw images with uniform frames
    for (let i = 0; i < images.length && i < 3; i++) {
      const img = images[i];
      const frameX = startX + (i * (frameWidth + spacing));
      const frameY = startY;
      
      // Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      
      // White frame/background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(frameX, frameY, frameWidth, frameHeight);
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      
      // Calculate image dimensions to fit within frame (contain mode)
      const imgAspect = img.width / img.height;
      const frameAspect = frameWidth / frameHeight;
      
      let drawWidth: number;
      let drawHeight: number;
      let drawX: number;
      let drawY: number;
      
      if (imgAspect > frameAspect) {
        // Image is wider than frame - fit to width
        drawWidth = frameWidth;
        drawHeight = frameWidth / imgAspect;
        drawX = frameX;
        drawY = frameY + (frameHeight - drawHeight) / 2;
      } else {
        // Image is taller than frame - fit to height
        drawHeight = frameHeight;
        drawWidth = frameHeight * imgAspect;
        drawX = frameX + (frameWidth - drawWidth) / 2;
        drawY = frameY;
      }
      
      // Draw image (contain fit - no cropping)
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      
      // Rank badge
      ctx.fillStyle = '#8B5CF6';
      const badgeSize = 32;
      const badgeX = frameX + 12;
      const badgeY = frameY + 12;
      ctx.beginPath();
      ctx.arc(badgeX + badgeSize/2, badgeY + badgeSize/2, badgeSize/2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, badgeX + badgeSize/2, badgeY + badgeSize/2 + 1);
    }

    // Reset text alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Footer
    ctx.fillStyle = '#999999';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText(`Generated by AVA • ${new Date().toLocaleDateString()}`, 40, height - 25);

    // Convert to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
    });
  }, []);

  // Export all ready looks
  const handleExportAllReady = useCallback(async () => {
    if (readyLooks.length === 0) {
      toast.error("No export-ready looks");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Preparing export...");

    try {
      const zip = new JSZip();
      const totalSlides = readyLooks.length * 4; // 4 shot types per look
      let processed = 0;

      for (const look of readyLooks) {
        const lookCode = look.lookCode.replace(/\s+/g, '_').toUpperCase();
        const lookFolder = zip.folder(lookCode);
        if (!lookFolder) continue;

        for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
          setExportStatus(`Exporting ${lookCode} - ${OUTPUT_SHOT_LABELS[shotType]}...`);

          const viewOutputs = look.outputsByView[shotType] || [];
          const favorites = viewOutputs
            .filter(o => o.is_favorite && o.result_url && o.favorite_rank)
            .sort((a, b) => (a.favorite_rank || 0) - (b.favorite_rank || 0))
            .slice(0, 3);

          if (favorites.length === 3) {
            const urls = favorites.map(f => f.result_url!);
            const slideBlob = await createSlide(lookCode, shotType, urls);
            const filename = `${lookCode}_${SHOT_TYPE_SUFFIXES[shotType]}.png`;
            lookFolder.file(filename, slideBlob);
          }

          processed++;
          setExportProgress((processed / totalSlides) * 100);
        }
      }

      setExportStatus("Generating ZIP file...");
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      // Download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repose_export_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark all exported looks as exported
      const allBatchItemIds = readyLooks.flatMap(l => l.batchItemIds);
      if (allBatchItemIds.length > 0) {
        await markExported.mutateAsync({ batchItemIds: allBatchItemIds });
      }

      toast.success(`Exported ${readyLooks.length} looks (${readyLooks.length * 4} slides)`);
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus("");
    }
  }, [readyLooks, createSlide]);

  // Export selected looks
  const handleExportSelected = useCallback(async () => {
    if (looksToExport.length === 0) {
      toast.error("No looks selected");
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus("Preparing export...");

    try {
      const zip = new JSZip();
      const totalSlides = looksToExport.length * 4;
      let processed = 0;

      for (const look of looksToExport) {
        const lookCode = look.lookCode.replace(/\s+/g, '_').toUpperCase();
        const lookFolder = zip.folder(lookCode);
        if (!lookFolder) continue;

        for (const shotType of ALL_OUTPUT_SHOT_TYPES) {
          setExportStatus(`Exporting ${lookCode} - ${OUTPUT_SHOT_LABELS[shotType]}...`);

          const viewOutputs = look.outputsByView[shotType] || [];
          const favorites = viewOutputs
            .filter(o => o.is_favorite && o.result_url && o.favorite_rank)
            .sort((a, b) => (a.favorite_rank || 0) - (b.favorite_rank || 0))
            .slice(0, 3);

          if (favorites.length === 3) {
            const urls = favorites.map(f => f.result_url!);
            const slideBlob = await createSlide(lookCode, shotType, urls);
            const filename = `${lookCode}_${SHOT_TYPE_SUFFIXES[shotType]}.png`;
            lookFolder.file(filename, slideBlob);
          }

          processed++;
          setExportProgress((processed / totalSlides) * 100);
        }
      }

      setExportStatus("Generating ZIP file...");
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repose_export_selected_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Mark selected looks as exported
      const selectedBatchItemIds = looksToExport.flatMap(l => l.batchItemIds);
      if (selectedBatchItemIds.length > 0) {
        await markExported.mutateAsync({ batchItemIds: selectedBatchItemIds });
      }

      toast.success(`Exported ${looksToExport.length} looks (${looksToExport.length * 4} slides)`);
      setSelectedLookIds(new Set());
    } catch (error) {
      console.error("Export failed:", error);
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus("");
    }
  }, [looksToExport, createSlide]);

  if (batchLoading || isLoading) {
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

  const selectedReady = Array.from(selectedLookIds).filter(id => 
    readyLooks.some(l => l.lookId === id)
  );

  return (
    <div className="h-[calc(100vh-220px)] flex flex-col">
      {/* Top Summary Bar */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card rounded-t-lg">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-semibold">Export</h2>
            <p className="text-sm text-muted-foreground">
              Download branded PNG slides for client delivery
            </p>
          </div>
          <div className="flex items-center gap-4 pl-6 border-l border-border">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">{readyLooks.length}</p>
              <p className="text-xs text-muted-foreground">Export-ready</p>
            </div>
            <p className="text-muted-foreground text-lg">/</p>
            <div className="text-center">
              <p className="text-2xl font-bold">{groupedByLook.length}</p>
              <p className="text-xs text-muted-foreground">Total Looks</p>
            </div>
            {incompleteLooks.length > 0 && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="text-center">
                  <p className="text-lg text-muted-foreground">{incompleteLooks.length}</p>
                  <p className="text-xs text-muted-foreground">Incomplete</p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedLookIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear ({selectedLookIds.size})
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleExportSelected}
            disabled={selectedReady.length === 0 || isExporting}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export Selected ({selectedReady.length})
          </Button>
          <Button
            onClick={handleExportAllReady}
            disabled={readyLooks.length === 0 || isExporting}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export All Ready ({readyLooks.length})
          </Button>
        </div>
      </div>

      {/* Export Progress */}
      {isExporting && (
        <div className="p-4 bg-secondary/30 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{exportStatus}</span>
            <span className="text-sm text-muted-foreground">{Math.round(exportProgress)}%</span>
          </div>
          <Progress value={exportProgress} className="h-2" />
        </div>
      )}

      {/* Main Content - Sidebar + Preview */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Looks List */}
        <div className="w-64 border-r border-border flex flex-col bg-card/50 flex-shrink-0">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Looks</span>
              {readyLooks.length > 0 && (
                <Button variant="ghost" size="sm" onClick={selectAllReady} className="h-6 text-xs">
                  Select All
                </Button>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {/* Ready Looks - Green, Selectable */}
              {readyLooks.map((look) => {
                const isExported = !!look.exportedAt;
                return (
                  <button
                    key={look.lookId}
                    onClick={() => toggleLookSelection(look.lookId)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors",
                      selectedLookIds.has(look.lookId)
                        ? "bg-primary/20 border border-primary/50"
                        : "hover:bg-secondary/80"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0",
                      isExported 
                        ? "bg-muted text-muted-foreground" 
                        : "bg-primary text-primary-foreground"
                    )}>
                      {isExported ? <Check className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">{look.lookCode}</span>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "text-[10px] px-1.5 py-0 h-4",
                        isExported 
                          ? "bg-muted/50 text-muted-foreground" 
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {isExported ? "Exported" : "Ready"}
                    </Badge>
                  </button>
                );
              })}

              {/* Separator */}
              {readyLooks.length > 0 && incompleteLooks.length > 0 && (
                <div className="py-2">
                  <div className="border-t border-border" />
                  <p className="text-[10px] text-muted-foreground/60 mt-2 px-3 uppercase tracking-wide">
                    Incomplete
                  </p>
                </div>
              )}

              {/* Incomplete Looks - Grey, Not Selectable */}
              {incompleteLooks.map((look) => {
                const completedViews = look.selectionStats.completedViews;
                return (
                  <div
                    key={look.lookId}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md opacity-50 cursor-not-allowed"
                  >
                    <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Circle className="w-2 h-2 text-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground truncate flex-1">{look.lookCode}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                      {completedViews}/4
                    </Badge>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-border bg-secondary/20">
            <p className="text-xs text-muted-foreground">
              <Lock className="w-3 h-3 inline mr-1" />
              Review-locked. Edit in Review tab.
            </p>
          </div>
        </div>

        {/* Main Preview Panel */}
        <div className="flex-1 p-6 overflow-auto">
          {selectedLookIds.size === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Download className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">Select looks to preview</h3>
                <p className="text-sm max-w-md">
                  Click on export-ready looks in the sidebar to see a preview of the slides that will be generated.
                  {readyLooks.length === 0 && incompleteLooks.length > 0 && (
                    <span className="block mt-2 text-amber-600">
                      No looks are export-ready yet. Complete selections in the Review tab first.
                    </span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {looksToExport.map((look) => (
                <Card key={look.lookId} className="overflow-hidden">
                  <CardHeader className="py-3 bg-secondary/30">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      {look.lookCode}
                      <Badge variant="default" className="ml-auto">Export Ready</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      {ALL_OUTPUT_SHOT_TYPES.map((shotType) => {
                        const viewOutputs = look.outputsByView[shotType] || [];
                        const favorites = viewOutputs
                          .filter(o => o.is_favorite && o.result_url)
                          .sort((a, b) => (a.favorite_rank || 0) - (b.favorite_rank || 0))
                          .slice(0, 3);

                        return (
                          <div key={shotType} className="border border-border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">{OUTPUT_SHOT_LABELS[shotType]}</span>
                              <Badge variant="secondary" className="text-xs">
                                {favorites.length}/3 selected
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {favorites.map((output, idx) => (
                                <div
                                  key={output.id}
                                  className="relative aspect-square rounded overflow-hidden bg-muted"
                                >
                                  <img
                                    src={output.result_url!}
                                    alt={`${shotType} ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                                    {output.favorite_rank}
                                  </div>
                                </div>
                              ))}
                              {favorites.length < 3 && Array.from({ length: 3 - favorites.length }).map((_, idx) => (
                                <div key={`empty-${idx}`} className="aspect-square rounded bg-muted/50 flex items-center justify-center">
                                  <AlertCircle className="w-4 h-4 text-muted-foreground/30" />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Output: {look.lookCode.replace(/\s+/g, '_').toUpperCase()}_front.png, _crop_front.png, _detail.png, _back.png
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
