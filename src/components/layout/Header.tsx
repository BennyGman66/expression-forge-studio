import { Sparkles, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  projectName?: string;
  onOpenProjects?: () => void;
}

export function Header({ projectName, onOpenProjects }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-primary">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              Expression Map Factory
            </h1>
            {projectName && (
              <p className="text-xs text-muted-foreground">{projectName}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenProjects && (
            <Button variant="outline" size="sm" onClick={onOpenProjects}>
              <FolderOpen className="w-4 h-4 mr-2" />
              Projects
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
