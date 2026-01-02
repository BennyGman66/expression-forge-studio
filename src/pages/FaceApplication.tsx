import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LooksUploadTab } from "@/components/face-application/LooksUploadTab";
import { HeadCropTab } from "@/components/face-application/HeadCropTab";
import { FaceMatchTab } from "@/components/face-application/FaceMatchTab";
import { GenerateTab } from "@/components/face-application/GenerateTab";
import { ReviewTab } from "@/components/face-application/ReviewTab";

export default function FaceApplication() {
  const [activeTab, setActiveTab] = useState("upload");
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card px-6 flex items-center gap-4">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Face Application</h1>
      </header>

      <main className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="upload">Looks Upload</TabsTrigger>
            <TabsTrigger value="crop" disabled={!selectedLookId}>Head Crop</TabsTrigger>
            <TabsTrigger value="match" disabled={!selectedLookId}>Face Match</TabsTrigger>
            <TabsTrigger value="generate" disabled={!selectedLookId}>Generate</TabsTrigger>
            <TabsTrigger value="review" disabled={!selectedLookId}>Review</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <LooksUploadTab
              selectedLookId={selectedLookId}
              setSelectedLookId={setSelectedLookId}
              selectedTalentId={selectedTalentId}
              setSelectedTalentId={setSelectedTalentId}
              onContinue={() => setActiveTab("crop")}
            />
          </TabsContent>

          <TabsContent value="crop">
            <HeadCropTab
              lookId={selectedLookId}
              talentId={selectedTalentId}
              onLookChange={setSelectedLookId}
              onContinue={() => setActiveTab("match")}
            />
          </TabsContent>

          <TabsContent value="match">
            <FaceMatchTab
              lookId={selectedLookId}
              talentId={selectedTalentId}
              onContinue={() => setActiveTab("generate")}
            />
          </TabsContent>

          <TabsContent value="generate">
            <GenerateTab
              lookId={selectedLookId}
              talentId={selectedTalentId}
              onContinue={() => setActiveTab("review")}
            />
          </TabsContent>

          <TabsContent value="review">
            <ReviewTab
              lookId={selectedLookId}
              talentId={selectedTalentId}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
