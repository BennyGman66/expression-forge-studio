import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Download, FileJson, FolderTree, Users, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceScrapeRun, FaceIdentity, FaceScrapeImage, FaceIdentityImage, FaceCrop } from "@/types/face-creator";

interface ExportPanelProps {
  runId: string | null;
}

interface ExportData {
  run: FaceScrapeRun;
  identities: Array<{
    identity: FaceIdentity;
    images: Array<{
      image: FaceScrapeImage;
      identityImage: FaceIdentityImage;
      crop?: FaceCrop;
    }>;
  }>;
}

export function ExportPanel({ runId }: ExportPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [includeOriginals, setIncludeOriginals] = useState(true);
  const [includeCrops, setIncludeCrops] = useState(true);

  useEffect(() => {
    if (runId) {
      fetchExportData();
    }
  }, [runId]);

  const fetchExportData = async () => {
    if (!runId) return;
    setLoading(true);
    
    // Fetch run
    const { data: runData } = await supabase
      .from('face_scrape_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (!runData) {
      setLoading(false);
      return;
    }

    // Fetch identities
    const { data: identitiesData } = await supabase
      .from('face_identities')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('name');

    if (!identitiesData) {
      setLoading(false);
      return;
    }

    const result: ExportData = {
      run: runData as unknown as FaceScrapeRun,
      identities: [],
    };

    for (const identity of identitiesData) {
      // Get identity images
      const { data: identityImages } = await supabase
        .from('face_identity_images')
        .select('*')
        .eq('identity_id', identity.id)
        .eq('is_ignored', false);

      if (!identityImages) continue;

      const imageIds = identityImages.map(ii => ii.scrape_image_id);
      
      // Get images
      const { data: images } = await supabase
        .from('face_scrape_images')
        .select('*')
        .in('id', imageIds);

      // Get crops
      const { data: crops } = await supabase
        .from('face_crops')
        .select('*')
        .in('scrape_image_id', imageIds);

      const cropsMap = new Map((crops || []).map(c => [c.scrape_image_id, c]));
      const identityImagesMap = new Map(identityImages.map(ii => [ii.scrape_image_id, ii]));

      result.identities.push({
        identity: identity as unknown as FaceIdentity,
        images: (images || []).map(img => ({
          image: img as unknown as FaceScrapeImage,
          identityImage: identityImagesMap.get(img.id) as unknown as FaceIdentityImage,
          crop: cropsMap.get(img.id) as unknown as FaceCrop | undefined,
        })),
      });
    }

    setExportData(result);
    setLoading(false);
  };

  const handleExportJSON = () => {
    if (!exportData) return;
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportData.run.brand_name}-face-dataset.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: "Exported", description: "JSON file downloaded" });
  };

  const handleDownloadZip = async () => {
    if (!exportData) return;
    setExporting(true);
    
    // Note: In a real implementation, this would call an edge function
    // that generates and returns a ZIP file. For now, show a placeholder.
    toast({ 
      title: "Coming Soon", 
      description: "ZIP download will be implemented in a future update" 
    });
    setExporting(false);
  };

  const totalImages = exportData?.identities.reduce(
    (sum, i) => sum + i.images.length, 0
  ) || 0;

  const croppedImages = exportData?.identities.reduce(
    (sum, i) => sum + i.images.filter(img => img.crop).length, 0
  ) || 0;

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to export data
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!exportData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No data to export
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Export Dataset</h2>
          <Badge variant="outline">{exportData.run.brand_name}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dataset Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Identities</span>
              <Badge variant="secondary">{exportData.identities.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total Images</span>
              <Badge variant="secondary">{totalImages}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cropped</span>
              <Badge variant="secondary">{croppedImages}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Men Identities</span>
              <Badge variant="secondary">
                {exportData.identities.filter(i => i.identity.gender === 'men').length}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Women Identities</span>
              <Badge variant="secondary">
                {exportData.identities.filter(i => i.identity.gender === 'women').length}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Export options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Export Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="originals" 
                checked={includeOriginals}
                onCheckedChange={(checked) => setIncludeOriginals(checked as boolean)}
              />
              <Label htmlFor="originals">Include original images</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="crops" 
                checked={includeCrops}
                onCheckedChange={(checked) => setIncludeCrops(checked as boolean)}
              />
              <Label htmlFor="crops">Include cropped images</Label>
            </div>

            <div className="pt-4 space-y-2">
              <Button onClick={handleExportJSON} className="w-full">
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </Button>
              <Button 
                variant="outline" 
                onClick={handleDownloadZip} 
                className="w-full"
                disabled={exporting}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download as ZIP
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Structure preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Dataset Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="font-mono text-xs space-y-1">
                <div className="text-primary">{exportData.run.brand_name}/</div>
                {exportData.identities.slice(0, 10).map((item) => (
                  <div key={item.identity.id} className="pl-4">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      <span>{item.identity.name}/</span>
                    </div>
                    {['front', 'side', 'back'].map(view => {
                      const viewImages = item.images.filter(
                        img => img.identityImage.view === view
                      );
                      if (viewImages.length === 0) return null;
                      return (
                        <div key={view} className="pl-4 flex items-center gap-1 text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          <span>{view}/ ({viewImages.length})</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {exportData.identities.length > 10 && (
                  <div className="pl-4 text-muted-foreground">
                    ... and {exportData.identities.length - 10} more identities
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
