import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Users, Crop, Package, Link2 } from "lucide-react";
import { ScrapePanel } from "@/components/face-creator/ScrapePanel";
import { ClassificationPanel } from "@/components/face-creator/ClassificationPanel";
import { CropEditorPanel } from "@/components/face-creator/CropEditorPanel";
import { ExportPanel } from "@/components/face-creator/ExportPanel";
import { ImagePairingPanel } from "@/components/face-creator/ImagePairingPanel";
import { HubHeader } from "@/components/layout/HubHeader";

export default function FaceCreator() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("scrape");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Talent Face Library" />

      <main className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-3xl">
            <TabsTrigger value="scrape" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              <span>Scrape</span>
            </TabsTrigger>
            <TabsTrigger value="classify" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Classify</span>
            </TabsTrigger>
            <TabsTrigger value="crop" className="flex items-center gap-2">
              <Crop className="h-4 w-4" />
              <span>Crop</span>
            </TabsTrigger>
            <TabsTrigger value="pairing" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span>Pairing</span>
            </TabsTrigger>
            <TabsTrigger value="export" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>Export</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scrape">
            <ScrapePanel 
              selectedRunId={selectedRunId} 
              onSelectRun={setSelectedRunId} 
            />
          </TabsContent>
          
          <TabsContent value="classify">
            <ClassificationPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="crop">
            <CropEditorPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="pairing">
            <ImagePairingPanel runId={selectedRunId} />
          </TabsContent>
          
          <TabsContent value="export">
            <ExportPanel runId={selectedRunId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}