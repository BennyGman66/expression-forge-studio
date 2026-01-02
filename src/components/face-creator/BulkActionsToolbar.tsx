import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, Star, X, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BulkActionsToolbarProps {
  selectedCount: number;
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onDelete: (ids: string[]) => void;
  onRegenerate?: (ids: string[]) => void;
  onDownload?: () => void;
}

export function BulkActionsToolbar({
  selectedCount,
  selectedIds,
  onClearSelection,
  onDelete,
  onRegenerate,
  onDownload,
}: BulkActionsToolbarProps) {
  const handleAddToFoundation = async () => {
    try {
      const { error } = await supabase
        .from("face_pairing_outputs")
        .update({ is_face_foundation: true })
        .in("id", Array.from(selectedIds));

      if (error) throw error;
      toast.success(`Added ${selectedCount} images to Face Foundations`);
      onClearSelection();
    } catch (error) {
      console.error("Error adding to foundations:", error);
      toast.error("Failed to add to Face Foundations");
    }
  };

  const handleBulkDelete = () => {
    onDelete(Array.from(selectedIds));
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-3">
      <span className="text-sm font-medium">
        {selectedCount} selected
      </span>
      
      <div className="h-4 w-px bg-border" />
      
      <Button variant="outline" size="sm" onClick={handleAddToFoundation}>
        <Star className="h-4 w-4 mr-2" />
        Add to Foundation
      </Button>
      
      {onDownload && (
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      )}
      
      {onRegenerate && (
        <Button variant="outline" size="sm" onClick={() => onRegenerate(Array.from(selectedIds))}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Regenerate
        </Button>
      )}
      
      <Button variant="outline" size="sm" onClick={handleBulkDelete} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>
      
      <div className="h-4 w-px bg-border" />
      
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        <X className="h-4 w-4 mr-2" />
        Clear
      </Button>
    </div>
  );
}
