import { useState, useEffect } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LooksUploadTab } from "@/components/face-application/LooksUploadTab";
import { HeadCropTab } from "@/components/face-application/HeadCropTab";
import { FaceMatchTab } from "@/components/face-application/FaceMatchTab";
import { GenerateTab } from "@/components/face-application/GenerateTab";
import { ReviewTab } from "@/components/face-application/ReviewTab";
import { FaceAppProjectsGrid } from "@/components/face-application/FaceAppProjectsGrid";
import { useFaceApplicationProjects } from "@/hooks/useFaceApplicationProjects";
import { supabase } from "@/integrations/supabase/client";

export default function FaceApplication() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { projects, loading, createProject, deleteProject, refetch } = useFaceApplicationProjects();
  const [projectName, setProjectName] = useState<string>("");
  
  const activeTab = searchParams.get("tab") || "upload";
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);

  // Fetch project name if we have a projectId
  useEffect(() => {
    if (!projectId) {
      setProjectName("");
      return;
    }
    const fetchProject = async () => {
      const { data } = await supabase
        .from("face_application_projects")
        .select("name")
        .eq("id", projectId)
        .single();
      if (data) setProjectName(data.name);
    };
    fetchProject();
  }, [projectId]);

  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleSelectProject = (id: string) => {
    navigate(`/face-application/${id}`);
  };

  const handleBackToProjects = () => {
    navigate("/face-application");
  };

  // If no project selected, show projects grid
  if (!projectId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="h-14 border-b border-border bg-card px-6 flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Face Application</h1>
        </header>

        <main className="p-6">
          <FaceAppProjectsGrid
            projects={projects}
            loading={loading}
            onSelect={handleSelectProject}
            onCreate={createProject}
            onDelete={deleteProject}
          />
        </main>
      </div>
    );
  }

  // Project workspace view
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card px-6 flex items-center gap-4">
        <button 
          onClick={handleBackToProjects}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">{projectName || "Project"}</h1>
      </header>

      <main className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="upload">Looks Upload</TabsTrigger>
            <TabsTrigger value="crop">Head Crop</TabsTrigger>
            <TabsTrigger value="match">Face Match</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <LooksUploadTab
              projectId={projectId}
              selectedLookId={selectedLookId}
              setSelectedLookId={setSelectedLookId}
              selectedTalentId={selectedTalentId}
              setSelectedTalentId={setSelectedTalentId}
              onContinue={() => setActiveTab("crop")}
            />
          </TabsContent>

          <TabsContent value="crop">
            <HeadCropTab
              projectId={projectId}
              lookId={selectedLookId}
              talentId={selectedTalentId}
              onLookChange={setSelectedLookId}
              onContinue={() => setActiveTab("match")}
            />
          </TabsContent>

          <TabsContent value="match">
            <FaceMatchTab
              projectId={projectId}
              talentId={selectedTalentId}
              onContinue={() => setActiveTab("generate")}
            />
          </TabsContent>

          <TabsContent value="generate">
            <GenerateTab
              projectId={projectId}
              lookId={selectedLookId}
              talentId={selectedTalentId}
              onContinue={() => setActiveTab("review")}
            />
          </TabsContent>

          <TabsContent value="review">
            <ReviewTab
              projectId={projectId}
              lookId={selectedLookId}
              talentId={selectedTalentId}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
