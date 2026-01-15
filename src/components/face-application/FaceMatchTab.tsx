import { FaceMatchLayout } from "./face-match";

interface FaceMatchTabProps {
  projectId: string;
  talentId: string | null;
  selectedLookIds?: Set<string>;
  onContinue: () => void;
}

export function FaceMatchTab({ projectId, selectedLookIds, onContinue }: FaceMatchTabProps) {
  return (
    <FaceMatchLayout
      projectId={projectId}
      selectedLookIds={selectedLookIds}
      onContinue={onContinue}
    />
  );
}
