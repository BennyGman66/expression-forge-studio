import { useSearchParams } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIngestPanel } from "@/components/avatar-repose/BrandIngestPanel";
import { ClayGenerationPanel } from "@/components/avatar-repose/ClayGenerationPanel";
import { ClayPoseLibraryReview } from "@/components/brand-pose-library/ClayPoseLibraryReview";
import { Globe, Palette, Library } from "lucide-react";

const VALID_TABS = ["ingest", "clay", "library"];

export default function BrandPoseLibrary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabFromUrl || "") ? tabFromUrl! : "ingest";

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Brand Pose Libraries" />

      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-serif">Brand Pose Libraries</h1>
            <p className="text-muted-foreground mt-1">
              Scrape brand imagery, generate clay poses, and curate reusable pose libraries
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <TabsList className="bg-secondary/50 p-1">
              <TabsTrigger value="ingest" className="gap-2">
                <Globe className="w-4 h-4" />
                Brand Ingest
              </TabsTrigger>
              <TabsTrigger value="clay" className="gap-2">
                <Palette className="w-4 h-4" />
                Clay Generation
              </TabsTrigger>
              <TabsTrigger value="library" className="gap-2">
                <Library className="w-4 h-4" />
                Clay Pose Library
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ingest">
              <BrandIngestPanel />
            </TabsContent>

            <TabsContent value="clay">
              <ClayGenerationPanel />
            </TabsContent>

            <TabsContent value="library" className="mt-0">
              <ClayPoseLibraryReview />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
