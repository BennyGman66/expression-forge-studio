import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Image as ImageIcon, Check, Pencil } from "lucide-react";
import { LookData, TalentOption } from "./LooksTable";
import { OptimizedImage } from "@/components/shared/OptimizedImage";
interface LookRowExpandedProps {
  look: LookData;
  talents: TalentOption[];
  onUpdateLook: (lookId: string, updates: Partial<LookData>) => void;
  onUploadImage: (lookId: string, view: string, file: File) => Promise<void>;
  onRemoveImage: (lookId: string, imageId: string) => void;
  onChangeImageView?: (imageId: string, newView: string) => void;
  uploadingViews: Record<string, boolean>;
}

export function LookRowExpanded({
  look,
  onUpdateLook,
  onUploadImage,
  onRemoveImage,
  onChangeImageView,
}: LookRowExpandedProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(look.name);

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== look.name) {
      onUpdateLook(look.id, { name: editedName.trim() });
    }
    setIsEditingName(false);
  };

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      {/* Name editing */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-20">Look Name:</Label>
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <Input
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="h-8 w-48"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setEditedName(look.name);
                  setIsEditingName(false);
                }
              }}
            />
            <Button size="sm" variant="ghost" onClick={handleSaveName}>
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
            onClick={() => setIsEditingName(true)}
          >
            {look.name}
            <Pencil className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* All images with view selector */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground">All Images ({look.sourceImages.length})</Label>
        <div className="grid grid-cols-6 gap-3 min-w-0">
          {look.sourceImages.map((image) => (
            <div key={image.id} className="space-y-1.5">
              <div className="relative aspect-[3/4] rounded-lg overflow-hidden border group">
                <OptimizedImage
                  src={image.source_url}
                  tier="thumb"
                  containerClassName="w-full h-full"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onRemoveImage(look.id, image.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Select
                value={image.view}
                onValueChange={(newView) => onChangeImageView?.(image.id, newView)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="back">Back</SelectItem>
                  <SelectItem value="side">Side</SelectItem>
                  <SelectItem value="detail">Detail</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          
          {/* Upload new image slot */}
          <label className="space-y-1.5 cursor-pointer">
            <div className="relative aspect-[3/4] rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary transition-colors flex items-center justify-center">
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="h-5 w-5" />
                <span className="text-xs">Add</span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadImage(look.id, "front", file);
              }}
            />
            <div className="h-7" /> {/* Spacer to align with selects */}
          </label>
        </div>
      </div>
    </div>
  );
}
