import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardHeader } from './DashboardHeader';
import { LooksDashboardTable } from './LooksDashboardTable';
import { BulkActionBar } from './BulkActionBar';
import { UploadDropZone } from './UploadDropZone';
import { StalledJobsPanel } from './StalledJobsPanel';
import { useWorkflowProject } from '@/hooks/useWorkflowProjects';
import { useWorkflowLooks } from '@/hooks/useWorkflowLooks';
import { useStalledJobs } from '@/hooks/useWorkflowQueue';
import { FilterMode, WorkflowLookWithDetails, WorkflowStage } from '@/types/optimised-workflow';
import { Loader2 } from 'lucide-react';

interface ProductionDashboardProps {
  projectId: string;
  onBack: () => void;
}

export function ProductionDashboard({ projectId, onBack }: ProductionDashboardProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('needs_action');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  const [showStalledPanel, setShowStalledPanel] = useState(false);

  const { data: project, isLoading: projectLoading } = useWorkflowProject(projectId);
  const { data: looks, isLoading: looksLoading } = useWorkflowLooks(projectId, filterMode);
  const { data: stalledJobs } = useStalledJobs(projectId);

  // Filter looks by search query
  const filteredLooks = useMemo(() => {
    if (!looks) return [];
    if (!searchQuery.trim()) return looks;
    
    const query = searchQuery.toLowerCase();
    return looks.filter(look => 
      look.look_code.toLowerCase().includes(query) ||
      (look.name && look.name.toLowerCase().includes(query))
    );
  }, [looks, searchQuery]);

  // Get stages of selected looks
  const selectedStages = useMemo(() => {
    const stages = new Set<WorkflowStage>();
    selectedLookIds.forEach(id => {
      const look = looks?.find(l => l.id === id);
      if (look) stages.add(look.stage);
    });
    return stages;
  }, [selectedLookIds, looks]);

  // Selection handlers
  const handleSelectLook = (lookId: string, selected: boolean) => {
    setSelectedLookIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(lookId);
      } else {
        next.delete(lookId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedLookIds(new Set(filteredLooks.map(l => l.id)));
  };

  const handleSelectNone = () => {
    setSelectedLookIds(new Set());
  };

  const handleSelectByStage = (stage: WorkflowStage) => {
    const looksInStage = filteredLooks.filter(l => l.stage === stage);
    setSelectedLookIds(new Set(looksInStage.map(l => l.id)));
  };

  // Get selected looks
  const selectedLooks = useMemo(() => {
    return filteredLooks.filter(l => selectedLookIds.has(l.id));
  }, [filteredLooks, selectedLookIds]);

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Project not found</p>
          <Button variant="outline" onClick={onBack} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <DashboardHeader
        project={project}
        filterMode={filterMode}
        onFilterModeChange={setFilterMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        stalledCount={stalledJobs?.length || 0}
        onStalledClick={() => setShowStalledPanel(true)}
        onBack={onBack}
      />

      {/* Upload Zone (collapsible or always visible at top) */}
      <div className="px-6 py-4 border-b">
        <UploadDropZone projectId={projectId} compact />
      </div>

      {/* Bulk Action Bar */}
      {selectedLookIds.size > 0 && (
        <BulkActionBar
          selectedLooks={selectedLooks}
          selectedStages={selectedStages}
          onClearSelection={handleSelectNone}
          projectId={projectId}
        />
      )}

      {/* Main Table */}
      <div className="flex-1 overflow-hidden">
        <LooksDashboardTable
          looks={filteredLooks}
          isLoading={looksLoading}
          selectedLookIds={selectedLookIds}
          onSelectLook={handleSelectLook}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          onSelectByStage={handleSelectByStage}
          projectId={projectId}
        />
      </div>

      {/* Stalled Jobs Panel */}
      <StalledJobsPanel
        open={showStalledPanel}
        onOpenChange={setShowStalledPanel}
        projectId={projectId}
        stalledJobs={stalledJobs || []}
      />
    </div>
  );
}
