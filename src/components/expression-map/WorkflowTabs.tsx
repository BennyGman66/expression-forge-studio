import { cn } from "@/lib/utils";

export type WorkflowStep = "brand-refs" | "recipes" | "talent" | "generate" | "review";

interface WorkflowTabsProps {
  currentStep: WorkflowStep;
  onStepChange: (step: WorkflowStep) => void;
  brandRefsCount: number;
  recipesCount: number;
  modelsCount: number;
  outputsCount?: number;
}

const tabs: { id: WorkflowStep; label: string }[] = [
  { id: "brand-refs", label: "Brand Refs" },
  { id: "recipes", label: "Recipes" },
  { id: "talent", label: "Digital Talent" },
  { id: "generate", label: "Generate" },
  { id: "review", label: "Review" },
];

export function WorkflowTabs({
  currentStep,
  onStepChange,
  brandRefsCount,
  recipesCount,
  modelsCount,
  outputsCount = 0,
}: WorkflowTabsProps) {
  const getCount = (id: WorkflowStep): number | null => {
    switch (id) {
      case "brand-refs":
        return brandRefsCount > 0 ? brandRefsCount : null;
      case "recipes":
        return recipesCount > 0 ? recipesCount : null;
      case "talent":
        return modelsCount > 0 ? modelsCount : null;
      case "review":
        return outputsCount > 0 ? outputsCount : null;
      default:
        return null;
    }
  };

  return (
    <div className="step-tabs">
      {tabs.map((tab) => {
        const count = getCount(tab.id);
        return (
          <button
            key={tab.id}
            onClick={() => onStepChange(tab.id)}
            className={cn("step-tab", currentStep === tab.id && "active")}
          >
            {tab.label}
            {count !== null && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
