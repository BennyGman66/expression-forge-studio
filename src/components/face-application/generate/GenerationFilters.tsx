import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, Sparkles, AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterMode = 'all' | 'needs_generation' | 'new' | 'complete' | 'failed';

interface GenerationFiltersProps {
  currentFilter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  counts: {
    all: number;
    needsGeneration: number;
    new: number;
    complete: number;
    failed: number;
  };
  disabled?: boolean;
}

export function GenerationFilters({
  currentFilter,
  onFilterChange,
  counts,
  disabled = false,
}: GenerationFiltersProps) {
  const filters: Array<{
    id: FilterMode;
    label: string;
    count: number;
    icon: React.ReactNode;
    variant: 'default' | 'destructive' | 'secondary' | 'outline';
  }> = [
    {
      id: 'needs_generation',
      label: 'Needs Generation',
      count: counts.needsGeneration,
      icon: <Sparkles className="w-3.5 h-3.5" />,
      variant: 'default',
    },
    {
      id: 'all',
      label: 'Show All',
      count: counts.all,
      icon: <Eye className="w-3.5 h-3.5" />,
      variant: 'secondary',
    },
    {
      id: 'new',
      label: 'New',
      count: counts.new,
      icon: <Filter className="w-3.5 h-3.5" />,
      variant: 'outline',
    },
    {
      id: 'complete',
      label: 'Complete',
      count: counts.complete,
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      variant: 'outline',
    },
    {
      id: 'failed',
      label: 'Failed',
      count: counts.failed,
      icon: <AlertCircle className="w-3.5 h-3.5" />,
      variant: 'outline',
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((filter) => (
        <Button
          key={filter.id}
          variant={currentFilter === filter.id ? 'default' : 'outline'}
          size="sm"
          className={cn(
            "h-8 gap-1.5",
            currentFilter === filter.id && filter.id === 'needs_generation' && "bg-amber-600 hover:bg-amber-700",
            filter.count === 0 && "opacity-50"
          )}
          onClick={() => onFilterChange(filter.id)}
          disabled={disabled || filter.count === 0}
        >
          {filter.icon}
          {filter.label}
          <Badge 
            variant="secondary" 
            className={cn(
              "h-5 min-w-5 px-1.5 text-[10px]",
              currentFilter === filter.id && "bg-background/20 text-inherit"
            )}
          >
            {filter.count}
          </Badge>
        </Button>
      ))}
    </div>
  );
}
