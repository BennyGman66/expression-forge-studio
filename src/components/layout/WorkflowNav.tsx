import { cn } from "@/lib/utils";
import { Check, Upload, Wand2, Users, Play } from "lucide-react";
import { Flex, Text, Badge } from "@radix-ui/themes";

export type WorkflowStep = 1 | 2 | 3 | 4;

interface WorkflowNavProps {
  currentStep: WorkflowStep;
  onStepClick: (step: WorkflowStep) => void;
  brandRefsCount: number;
  recipesCount: number;
  modelsCount: number;
}

const steps = [
  { id: 1 as WorkflowStep, label: "Brand Refs", icon: Upload },
  { id: 2 as WorkflowStep, label: "Extract Recipes", icon: Wand2 },
  { id: 3 as WorkflowStep, label: "Digital Talent", icon: Users },
  { id: 4 as WorkflowStep, label: "Generate", icon: Play },
];

export function WorkflowNav({ 
  currentStep, 
  onStepClick,
  brandRefsCount,
  recipesCount,
  modelsCount,
}: WorkflowNavProps) {
  const getStepStatus = (stepId: WorkflowStep): 'active' | 'completed' | 'pending' => {
    if (stepId === currentStep) return 'active';
    if (stepId < currentStep) return 'completed';
    return 'pending';
  };

  const getStepBadge = (stepId: WorkflowStep): string | null => {
    switch (stepId) {
      case 1: return brandRefsCount > 0 ? String(brandRefsCount) : null;
      case 2: return recipesCount > 0 ? String(recipesCount) : null;
      case 3: return modelsCount > 0 ? String(modelsCount) : null;
      default: return null;
    }
  };

  return (
    <nav className="bg-card border-b border-border px-6 py-4">
      <Flex align="center" justify="center" gap="2" className="md:gap-4">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          const badge = getStepBadge(step.id);
          const Icon = step.icon;
          
          return (
            <Flex key={step.id} align="center">
              <button
                onClick={() => onStepClick(step.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
                  status === 'active' && "bg-primary/10 text-primary",
                  status === 'completed' && "text-primary/80 hover:bg-primary/5",
                  status === 'pending' && "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "step-indicator",
                  status === 'active' && "active",
                  status === 'completed' && "completed",
                  status === 'pending' && "pending"
                )}>
                  {status === 'completed' ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                <Text size="2" weight="medium" className="hidden md:inline">
                  {step.label}
                </Text>
                {badge && (
                  <Badge color="lime" size="1" variant="soft">
                    {badge}
                  </Badge>
                )}
              </button>
              
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-8 md:w-12 h-px mx-1 md:mx-2",
                  index < currentStep - 1 ? "bg-primary/40" : "bg-border"
                )} />
              )}
            </Flex>
          );
        })}
      </Flex>
    </nav>
  );
}
