import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Camera, Users, Eye, Crop, Package } from "lucide-react";
import { ScrapePanel } from "@/components/face-creator/ScrapePanel";
import { GenderSegmentPanel } from "@/components/face-creator/GenderSegmentPanel";
import { FaceDetectionPanel } from "@/components/face-creator/FaceDetectionPanel";
import { IdentityClusterPanel } from "@/components/face-creator/IdentityClusterPanel";
import { ViewClassificationPanel } from "@/components/face-creator/ViewClassificationPanel";
import { CropEditorPanel } from "@/components/face-creator/CropEditorPanel";
import { ExportPanel } from "@/components/face-creator/ExportPanel";

export default function FaceCreator() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("scrape");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex justify-between items-center p-6 border-b border-border">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-semibold">Face Creator</h1>
          <span className="text-muted-foreground text-sm">Scrape & Segment Models</span>
        </div>
        <div className="w-10 h-10 rounded-full bg-lime-400 flex items-center justify-center text-sm font-medium">
          BG
        </div>
      </header>

      <main className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-7 w-full max-w-4xl">
            <TabsTrigger value="scrape" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Scrape</span>
            </TabsTrigger>
            <TabsTrigger value="gender" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Gender</span>
            </TabsTrigger>
            <TabsTrigger value="faces" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Faces</span>
            </TabsTrigger>
            <TabsTrigger value="identity" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Identity</span>
            </TabsTrigger>
            <TabsTrigger value="views" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Views</span>
            </TabsTrigger>
            <TabsTrigger value="crop" className="flex items-center gap-2">
              <Crop className="h-4 w-4" />
              <span className="hidden sm:inline">Crop</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scrape">
            <ScrapePanel 
              selectedRunId={selectedRunId} 
              onSelectRun={setSelectedRunId} 
            />
          </TabsContent>
          
          <TabsContent value="gender">
            <GenderSegmentPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="faces">
            <FaceDetectionPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="identity">
            <IdentityClusterPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="views">
            <ViewClassificationPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="crop">
            <CropEditorPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="export">
            <ExportPanel runId={selectedRunId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
