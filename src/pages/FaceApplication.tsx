import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LooksUploadTab } from "@/components/face-application/LooksUploadTab";
import { HeadCropTab } from "@/components/face-application/HeadCropTab";
import { FaceMatchTab } from "@/components/face-application/FaceMatchTab";
import { GenerateTabEnhanced } from "@/components/face-application/generate";
import { SendToJobBoardTab } from "@/components/face-application/SendToJobBoardTab";
import { FaceAppProjectsGrid } from "@/components/face-application/FaceAppProjectsGrid";
import { useFaceApplicationProjects } from "@/hooks/useFaceApplicationProjects";
import { supabase } from "@/integrations/supabase/client";
import { WorkflowStateProvider, useWorkflowStateContext } from "@/contexts/WorkflowStateContext";
import { WorkflowFilterBar } from "@/components/face-application/WorkflowFilterBar";
import { TabBadge } from "@/components/face-application/TabBadge";
import { TAB_NAMES, TAB_LABELS, type TabName } from "@/types/workflow-state";

// Tab configuration - streamlined workflow
const TABS: { value: TabName; label: string }[] = [
  { value: 'upload', label: 'Looks Upload' },
  { value: 'crop', label: 'Head Crop' },
  { value: 'match', label: 'Face Match' },
  { value: 'generate', label: 'Generate' },
  { value: 'handoff', label: 'Send to Job Board' },
];

export default function FaceApplication() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { projects, loading, createProject, deleteProject, refetch } = useFaceApplicationProjects();
  const [projectName, setProjectName] = useState<string>("");
  
  const activeTab = searchParams.get("tab") || "upload";
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());

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

  // Project workspace view - wrapped in provider
  return (
    <WorkflowStateProvider projectId={projectId}>
      <FaceApplicationWorkspace
        projectId={projectId}
        projectName={projectName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedLookId={selectedLookId}
        setSelectedLookId={setSelectedLookId}
        selectedTalentId={selectedTalentId}
        setSelectedTalentId={setSelectedTalentId}
        selectedLookIds={selectedLookIds}
        setSelectedLookIds={setSelectedLookIds}
        onBackToProjects={handleBackToProjects}
      />
    </WorkflowStateProvider>
  );
}

// Inner component that can use workflow context
interface WorkspaceProps {
  projectId: string;
  projectName: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedLookId: string | null;
  setSelectedLookId: (id: string | null) => void;
  selectedTalentId: string | null;
  setSelectedTalentId: (id: string | null) => void;
  selectedLookIds: Set<string>;
  setSelectedLookIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onBackToProjects: () => void;
}

function FaceApplicationWorkspace({
  projectId,
  projectName,
  activeTab,
  setActiveTab,
  selectedLookId,
  setSelectedLookId,
  selectedTalentId,
  setSelectedTalentId,
  selectedLookIds,
  setSelectedLookIds,
  onBackToProjects,
}: WorkspaceProps) {
  const workflowState = useWorkflowStateContext();
  const currentTabSummary = workflowState.getTabSummary(activeTab as TabName);
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border bg-card px-6 flex items-center gap-4 flex-shrink-0">
        <button 
          onClick={onBackToProjects}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">{projectName || "Project"}</h1>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border bg-card px-6">
          <TabsList className="h-12 bg-transparent p-0 gap-1">
            {TABS.map((tab) => {
              const summary = workflowState.getTabSummary(tab.value);
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
                >
                  {tab.label}
                  <TabBadge
                    needsAction={summary.needsAction}
                    total={summary.total}
                    complete={summary.complete}
                  />
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <WorkflowFilterBar
          filterMode={workflowState.filterMode}
          onFilterChange={workflowState.setFilterMode}
          needsActionCount={currentTabSummary.needsAction}
          totalCount={currentTabSummary.total}
          completeCount={currentTabSummary.complete}
          currentTab={activeTab as TabName}
          isLoading={workflowState.isLoading}
          isSyncing={workflowState.isSyncing}
        />

        <main className="flex-1 p-6 overflow-auto">
          <TabsContent value="upload" className="mt-0">
            <LooksUploadTab
              projectId={projectId}
              selectedLookId={selectedLookId}
              setSelectedLookId={setSelectedLookId}
              selectedTalentId={selectedTalentId}
              setSelectedTalentId={setSelectedTalentId}
              selectedLookIds={selectedLookIds}
              setSelectedLookIds={setSelectedLookIds}
              onContinue={() => setActiveTab("crop")}
            />
          </TabsContent>

          <TabsContent value="crop" className="mt-0">
            <HeadCropTab
              projectId={projectId}
              lookId={selectedLookId}
              talentId={selectedTalentId}
              selectedLookIds={selectedLookIds}
              onLookChange={setSelectedLookId}
              onContinue={() => setActiveTab("match")}
            />
          </TabsContent>

          <TabsContent value="match" className="mt-0">
            <FaceMatchTab
              projectId={projectId}
              talentId={selectedTalentId}
              selectedLookIds={selectedLookIds}
              onContinue={() => setActiveTab("generate")}
            />
          </TabsContent>

          <TabsContent value="generate" className="mt-0">
            <GenerateTabEnhanced
              projectId={projectId}
              lookId={selectedLookId}
              talentId={selectedTalentId}
              selectedLookIds={selectedLookIds}
              onContinue={() => setActiveTab("handoff")}
            />
          </TabsContent>

          <TabsContent value="handoff" className="mt-0">
            <SendToJobBoardTab projectId={projectId} selectedLookIds={selectedLookIds} />
          </TabsContent>
        </main>
      </Tabs>
    </div>
  );
}
