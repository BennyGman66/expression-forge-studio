import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Upload, Image as ImageIcon, Check, Pencil } from "lucide-react";
import { LookData, TalentOption } from "./LooksTable";
import { cn } from "@/lib/utils";

interface LookRowExpandedProps {
  look: LookData;
  talents: TalentOption[];
  onUpdateLook: (lookId: string, updates: Partial<LookData>) => void;
  onUploadImage: (lookId: string, view: string, file: File) => Promise<void>;
  onRemoveImage: (lookId: string, imageId: string) => void;
  uploadingViews: Record<string, boolean>;
}

const VIEWS = [
  { key: "front", label: "Front", required: true },
  { key: "back", label: "Back", required: true },
  { key: "side", label: "Side", required: false },
  { key: "detail", label: "Detail", required: false },
] as const;

export function LookRowExpanded({
  look,
  talents,
  onUpdateLook,
  onUploadImage,
  onRemoveImage,
  uploadingViews,
}: LookRowExpandedProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(look.name);
  const [dragOverView, setDragOverView] = useState<string | null>(null);

  const getImageForView = (view: string) => {
    return look.sourceImages.find((img) => img.view === view);
  };

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== look.name) {
      onUpdateLook(look.id, { name: editedName.trim() });
    }
    setIsEditingName(false);
  };

  const handleDrop = (view: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverView(null);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onUploadImage(look.id, view, file);
    }
  };

  return (
    <div className="p-4 space-y-4">
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

      {/* Upload slots */}
      <div className="grid grid-cols-4 gap-4">
        {VIEWS.map(({ key, label, required }) => {
          const image = getImageForView(key);
          const isUploading = uploadingViews[`${look.id}-${key}`];
          const isDragOver = dragOverView === key;

          return (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                {label}
                {required && <span className="text-amber-500">*</span>}
              </Label>
              <label
                className={cn(
                  "relative aspect-[3/4] border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all overflow-hidden group",
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "hover:border-primary",
                  image ? "border-solid border-muted" : "border-muted-foreground/30"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverView(key);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverView(key);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOverView(null);
                }}
                onDrop={(e) => handleDrop(key, e)}
              >
                {image ? (
                  <>
                    <img
                      src={image.source_url}
                      alt={label}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          // Trigger file input
                        }}
                      >
                        Replace
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveImage(look.id, image.id);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    {isUploading ? (
                      <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                    ) : (
                      <>
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-xs">
                          {isDragOver ? "Drop here" : "Upload"}
                        </span>
                      </>
                    )}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadImage(look.id, key, file);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
