import { createContext, useContext, ReactNode } from 'react';
import { useWorkflowState } from '@/hooks/useWorkflowState';
import type { WorkflowStateContextValue, FilterMode } from '@/types/workflow-state';

const defaultContext: WorkflowStateContextValue = {
  lookStates: new Map(),
  lookSummaries: new Map(),
  filterMode: 'needs_action',
  setFilterMode: () => {},
  updateViewState: async () => {},
  signOffView: async () => {},
  signOffLook: async () => {},
  unlockView: async () => {},
  getFilteredLooks: () => [],
  getTabSummary: () => ({ needsAction: 0, total: 0, complete: 0 }),
  refetch: async () => {},
  isLoading: false,
};

const WorkflowStateContext = createContext<WorkflowStateContextValue>(defaultContext);

interface WorkflowStateProviderProps {
  projectId: string;
  children: ReactNode;
}

export function WorkflowStateProvider({ projectId, children }: WorkflowStateProviderProps) {
  const workflowState = useWorkflowState({ projectId });
  
  return (
    <WorkflowStateContext.Provider value={workflowState}>
      {children}
    </WorkflowStateContext.Provider>
  );
}

export function useWorkflowStateContext(): WorkflowStateContextValue {
  return useContext(WorkflowStateContext);
}
