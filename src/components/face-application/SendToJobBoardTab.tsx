import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useLookHandoffData } from '@/hooks/useLookHandoffData';
import { useSendToJobBoard } from '@/hooks/useSendToJobBoard';
import { LooksHandoffList } from './handoff/LooksHandoffList';
import { JobPreviewPanel } from './handoff/JobPreviewPanel';
import { BriefAndActionsPanel } from './handoff/BriefAndActionsPanel';
import { DEFAULT_BRIEF } from '@/types/job-handoff';

interface SendToJobBoardTabProps {
  projectId: string;
}

export function SendToJobBoardTab({ projectId }: SendToJobBoardTabProps) {
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [jobGroupName, setJobGroupName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [brief, setBrief] = useState('');
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);

  const {
    looks,
    summary,
    isLoading,
    error,
    toggleLookInclusion,
    selectAllLooks,
    deselectAllLooks,
  } = useLookHandoffData(projectId);

  const { sendToJobBoard, isSending } = useSendToJobBoard();

  // Fetch project name
  useEffect(() => {
    const fetchProject = async () => {
      const { data } = await supabase
        .from('face_application_projects')
        .select('name')
        .eq('id', projectId)
        .single();
      
      if (data) {
        setProjectName(data.name);
        setJobGroupName(data.name);
      }
    };
    fetchProject();
  }, [projectId]);

  // Auto-select first look
  useEffect(() => {
    if (looks.length > 0 && !selectedLookId) {
      setSelectedLookId(looks[0].id);
    }
  }, [looks, selectedLookId]);

  const selectedLook = looks.find(l => l.id === selectedLookId) || null;

  const canSend = 
    brief.trim().length > 0 && 
    summary.totalJobs > 0;

  const handleSend = async () => {
    const result = await sendToJobBoard({
      projectId,
      jobGroupName: jobGroupName || projectName,
      brief,
      looks,
    });

    if (result.success && result.jobGroupId) {
      // Navigate to Job Board with filter
      navigate(`/jobs?group=${result.jobGroupId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-center">
        <p className="text-destructive mb-2">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  if (looks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] text-center">
        <p className="text-muted-foreground mb-4">
          No looks found in this project. Complete the Review step first.
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back to Review
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-180px)] flex border border-border rounded-lg overflow-hidden bg-background">
      {/* Left Column: Looks Overview */}
      <div className="w-72 flex-shrink-0">
        <LooksHandoffList
          looks={looks}
          summary={summary}
          selectedLookId={selectedLookId}
          onSelectLook={setSelectedLookId}
          onToggleInclusion={toggleLookInclusion}
          onSelectAll={selectAllLooks}
          onDeselectAll={deselectAllLooks}
        />
      </div>

      {/* Center Column: Job Preview */}
      <div className="flex-1 border-l border-r border-border">
        <JobPreviewPanel
          projectName={projectName}
          jobGroupName={jobGroupName}
          onJobGroupNameChange={setJobGroupName}
          selectedLook={selectedLook}
          summary={summary}
          isEditingName={isEditingName}
          onStartEditName={() => setIsEditingName(true)}
          onEndEditName={() => setIsEditingName(false)}
        />
      </div>

      {/* Right Column: Brief & Actions */}
      <div className="w-80 flex-shrink-0">
        <BriefAndActionsPanel
          brief={brief}
          onBriefChange={setBrief}
          summary={summary}
          onSend={handleSend}
          isSending={isSending}
          canSend={canSend}
        />
      </div>
    </div>
  );
}
