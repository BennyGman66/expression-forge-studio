import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandPoseLibrary, LibraryStatus } from "@/hooks/useBrandLibraries";
import { Plus, Lock, Eye, FileEdit } from "lucide-react";

interface LibraryHeaderProps {
  brandName: string;
  libraries: BrandPoseLibrary[];
  activeLibrary: BrandPoseLibrary | null;
  onSelectLibrary: (library: BrandPoseLibrary) => void;
  onCreateVersion: () => void;
  isLocked: boolean;
}

const STATUS_CONFIG: Record<LibraryStatus, { label: string; variant: "default" | "secondary" | "outline"; icon: React.ReactNode }> = {
  draft: { label: "Draft", variant: "secondary", icon: <FileEdit className="w-3 h-3" /> },
  review: { label: "In Review", variant: "outline", icon: <Eye className="w-3 h-3" /> },
  locked: { label: "Locked", variant: "default", icon: <Lock className="w-3 h-3" /> },
};

export function LibraryHeader({
  brandName,
  libraries,
  activeLibrary,
  onSelectLibrary,
  onCreateVersion,
  isLocked,
}: LibraryHeaderProps) {
  const statusConfig = activeLibrary ? STATUS_CONFIG[activeLibrary.status] : null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">{brandName}</h2>

        {libraries.length > 0 && (
          <Select
            value={activeLibrary?.id || ""}
            onValueChange={(id) => {
              const lib = libraries.find((l) => l.id === id);
              if (lib) onSelectLibrary(lib);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select version" />
            </SelectTrigger>
            <SelectContent>
              {libraries.map((lib) => (
                <SelectItem key={lib.id} value={lib.id}>
                  v{lib.version} ({lib.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {statusConfig && (
          <Badge variant={statusConfig.variant} className="flex items-center gap-1">
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isLocked && (
          <Button size="sm" onClick={onCreateVersion}>
            <Plus className="w-4 h-4 mr-1" />
            New Version
          </Button>
        )}
      </div>
    </div>
  );
}
