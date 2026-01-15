import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Check, AlertTriangle } from "lucide-react";
import { extractLookKey } from "@/lib/tiffImportUtils";
import { LookData } from "./LooksTable";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DuplicateGroup {
  code: string;
  keep: LookData;
  keepReason: string;
  toDelete: LookData[];
}

interface DeleteDuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  looks: LookData[];
  onDeleteDuplicates: (lookIdsToDelete: string[]) => Promise<void>;
}

export function DeleteDuplicatesDialog({
  open,
  onOpenChange,
  looks,
  onDeleteDuplicates,
}: DeleteDuplicatesDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const duplicateGroups = useMemo((): DuplicateGroup[] => {
    // Group looks by extracted product code
    const codeGroups = new Map<string, LookData[]>();

    for (const look of looks) {
      // Try to extract code from look_code field first, then from name
      const code = look.look_code || extractLookKey(look.name);
      if (!code) continue;

      const key = code.toUpperCase();
      const group = codeGroups.get(key) || [];
      group.push(look);
      codeGroups.set(key, group);
    }

    // Find groups with duplicates (2+ looks)
    const groups: DuplicateGroup[] = [];

    for (const [code, group] of codeGroups) {
      if (group.length <= 1) continue;

      // Sort by preference: more images > has look_code > older
      const sorted = [...group].sort((a, b) => {
        const aImages = a.sourceImages.length;
        const bImages = b.sourceImages.length;
        if (aImages !== bImages) return bImages - aImages;

        const aHasCode = !!a.look_code;
        const bHasCode = !!b.look_code;
        if (aHasCode && !bHasCode) return -1;
        if (!aHasCode && bHasCode) return 1;

        // Prefer older (first created)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const keep = sorted[0];
      let keepReason = "More images";
      
      if (keep.sourceImages.length === sorted[1]?.sourceImages.length) {
        if (keep.look_code && !sorted[1]?.look_code) {
          keepReason = "Has product code";
        } else {
          keepReason = "Created first";
        }
      }

      groups.push({
        code,
        keep,
        keepReason,
        toDelete: sorted.slice(1),
      });
    }

    return groups;
  }, [looks]);

  const totalToDelete = duplicateGroups.reduce((sum, g) => sum + g.toDelete.length, 0);

  const handleDelete = async () => {
    const idsToDelete = duplicateGroups.flatMap((g) => g.toDelete.map((l) => l.id));
    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      await onDeleteDuplicates(idsToDelete);
      onOpenChange(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (duplicateGroups.length === 0) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              No Duplicates Found
            </AlertDialogTitle>
            <AlertDialogDescription>
              All looks in this project have unique product codes. No cleanup needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Delete {totalToDelete} Duplicate{totalToDelete !== 1 ? "s" : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Found {duplicateGroups.length} product{duplicateGroups.length !== 1 ? "s" : ""} with duplicate entries. 
            The following looks will be deleted:
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ScrollArea className="max-h-[300px] border rounded-md">
          <div className="p-3 space-y-4">
            {duplicateGroups.map((group) => (
              <div key={group.code} className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.code}
                </div>
                
                {/* Keep */}
                <div className="flex items-center gap-2 text-sm pl-2">
                  <Check className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="truncate font-medium">{group.keep.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({group.keep.sourceImages.length} img · {group.keepReason})
                  </span>
                </div>

                {/* Delete */}
                {group.toDelete.map((look) => (
                  <div key={look.id} className="flex items-center gap-2 text-sm pl-2">
                    <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                    <span className="truncate text-muted-foreground">{look.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      ({look.sourceImages.length} img)
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : `Delete ${totalToDelete} Duplicate${totalToDelete !== 1 ? "s" : ""}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Helper to count duplicates for the button badge
export function countDuplicates(looks: LookData[]): number {
  const codeGroups = new Map<string, number>();

  for (const look of looks) {
    const code = look.look_code || extractLookKey(look.name);
    if (!code) continue;
    const key = code.toUpperCase();
    codeGroups.set(key, (codeGroups.get(key) || 0) + 1);
  }

  let duplicateCount = 0;
  for (const count of codeGroups.values()) {
    if (count > 1) duplicateCount += count - 1;
  }

  return duplicateCount;
}
