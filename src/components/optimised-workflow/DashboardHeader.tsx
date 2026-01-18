import { ArrowLeft, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WorkflowProjectWithStats, FilterMode } from '@/types/optimised-workflow';

interface DashboardHeaderProps {
  project: WorkflowProjectWithStats;
  filterMode: FilterMode;
  onFilterModeChange: (mode: FilterMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  stalledCount: number;
  onStalledClick: () => void;
  onBack: () => void;
}

export function DashboardHeader({
  project,
  filterMode,
  onFilterModeChange,
  searchQuery,
  onSearchChange,
  stalledCount,
  onStalledClick,
  onBack,
}: DashboardHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-background border-b">
      <div className="px-6 py-4">
        {/* Top row: Back button, title, stalled badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Projects
            </Button>
            <h1 className="text-xl font-semibold text-foreground">
              {project.name}
            </h1>
          </div>

          {stalledCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-600 hover:bg-amber-50"
              onClick={onStalledClick}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {stalledCount} stalled
            </Button>
          )}
        </div>

        {/* Second row: Stats, filter toggle, search */}
        <div className="flex items-center justify-between gap-4">
          {/* Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-medium">{project.totalLooks} looks</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Needs Action:</span>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {project.needsActionCount}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Complete:</span>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                {project.completedCount}
              </Badge>
            </div>
          </div>

          {/* Filter Toggle + Search */}
          <div className="flex items-center gap-4">
            <ToggleGroup
              type="single"
              value={filterMode}
              onValueChange={(value) => value && onFilterModeChange(value as FilterMode)}
              className="bg-muted rounded-lg p-1"
            >
              <ToggleGroupItem
                value="needs_action"
                className="text-sm px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Needs Action
              </ToggleGroupItem>
              <ToggleGroupItem
                value="all"
                className="text-sm px-3 py-1.5 data-[state=on]:bg-background data-[state=on]:shadow-sm"
              >
                Show All
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search looks..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
