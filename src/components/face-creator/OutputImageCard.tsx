import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Crop, RefreshCw, Star, Check, Loader2, X, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OutputImageCardProps {
  output: {
    id: string;
    pairing_id: string;
    stored_url: string | null;
    status: string;
    is_face_foundation?: boolean;
  };
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRegenerate?: (pairingId: string) => void;
  onCrop?: (id: string) => void;
  sourcePreview?: React.ReactNode;
  talentAvatar?: string;
}

export function OutputImageCard({
  output,
  isSelected,
  onToggleSelect,
  onDelete,
  onRegenerate,
  onCrop,
  sourcePreview,
  talentAvatar,
}: OutputImageCardProps) {
  const [isAddingToFoundation, setIsAddingToFoundation] = useState(false);
  const [isFoundation, setIsFoundation] = useState(output.is_face_foundation || false);

  const handleAddToFoundation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddingToFoundation(true);
    try {
      const { error } = await supabase
        .from("face_pairing_outputs")
        .update({ is_face_foundation: true })
        .eq("id", output.id);

      if (error) throw error;
      setIsFoundation(true);
      toast.success("Added to Face Foundations");
    } catch (error) {
      console.error("Error adding to foundation:", error);
      toast.error("Failed to add to Face Foundations");
    } finally {
      setIsAddingToFoundation(false);
    }
  };

  const handleRemoveFromFoundation = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddingToFoundation(true);
    try {
      const { error } = await supabase
        .from("face_pairing_outputs")
        .update({ is_face_foundation: false })
        .eq("id", output.id);

      if (error) throw error;
      setIsFoundation(false);
      toast.success("Removed from Face Foundations");
    } catch (error) {
      console.error("Error removing from foundation:", error);
      toast.error("Failed to remove from Face Foundations");
    } finally {
      setIsAddingToFoundation(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(output.id);
  };

  const handleRegenerate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRegenerate?.(output.pairing_id);
  };

  const handleCrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCrop?.(output.id);
  };

  return (
    <div
      className={`relative group aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer ${
        isSelected
          ? "border-primary"
          : "border-transparent hover:border-muted-foreground/30"
      }`}
      onClick={() => output.status === "completed" && onToggleSelect(output.id)}
    >
      {output.status === "completed" && output.stored_url ? (
        <>
          <img
            src={output.stored_url}
            alt=""
            className="w-full h-full object-cover"
          />
          
          {/* Foundation badge */}
          {isFoundation && (
            <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              Foundation
            </div>
          )}

          {/* Three-dots menu */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {!isFoundation ? (
                  <DropdownMenuItem onClick={handleAddToFoundation} disabled={isAddingToFoundation}>
                    <Star className="h-4 w-4 mr-2" />
                    Add to Foundation
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handleRemoveFromFoundation} disabled={isAddingToFoundation}>
                    <Star className="h-4 w-4 mr-2" />
                    Remove from Foundation
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleCrop}>
                  <Crop className="h-4 w-4 mr-2" />
                  Crop / Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRegenerate}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Hover overlay with source images */}
          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end pointer-events-none">
            <div className="flex gap-1">
              {sourcePreview}
              {talentAvatar && (
                <div className="w-8 h-8 rounded-full overflow-hidden bg-muted/20">
                  <img
                    src={talentAvatar}
                    alt="Talent"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Selection indicator */}
          {isSelected && (
            <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
        </>
      ) : output.status === "running" ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mb-2" />
          <span className="text-xs">Generating...</span>
        </div>
      ) : output.status === "failed" ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
          <X className="h-6 w-6 mb-2" />
          <span className="text-xs">Failed</span>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
          <Clock className="h-6 w-6 mb-2" />
          <span className="text-xs">Pending</span>
        </div>
      )}
    </div>
  );
}
