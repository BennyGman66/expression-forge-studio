import { useState } from "react";
import { HubHeader } from "@/components/layout/HubHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIngestPanel } from "@/components/avatar-repose/BrandIngestPanel";
import { ClayGenerationPanel } from "@/components/avatar-repose/ClayGenerationPanel";
import { TalentLibraryPanel } from "@/components/avatar-repose/TalentLibraryPanel";
import { PoseGeneratorPanel } from "@/components/avatar-repose/PoseGeneratorPanel";
import { Globe, Palette, Users, Sparkles } from "lucide-react";

export default function AvatarRepose() {
  const [activeTab, setActiveTab] = useState("ingest");

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Avatar Repose" />

      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-serif">Brand Pose Mapper</h1>
            <p className="text-muted-foreground mt-1">
              Scrape fashion brands, generate clay poses, and create new model imagery
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-secondary/50 p-1">
              <TabsTrigger value="ingest" className="gap-2">
                <Globe className="w-4 h-4" />
                Brand Ingest
              </TabsTrigger>
              <TabsTrigger value="clay" className="gap-2">
                <Palette className="w-4 h-4" />
                Clay Generation
              </TabsTrigger>
              <TabsTrigger value="talent" className="gap-2">
                <Users className="w-4 h-4" />
                Talent Library
              </TabsTrigger>
              <TabsTrigger value="generate" className="gap-2">
                <Sparkles className="w-4 h-4" />
                Pose Generator
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ingest">
              <BrandIngestPanel />
            </TabsContent>

            <TabsContent value="clay">
              <ClayGenerationPanel />
            </TabsContent>

            <TabsContent value="talent">
              <TalentLibraryPanel />
            </TabsContent>

            <TabsContent value="generate">
              <PoseGeneratorPanel />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
