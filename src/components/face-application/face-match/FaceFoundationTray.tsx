import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { FaceFoundation } from "@/types/face-application";
import { LookWithImages } from "./types";

interface FaceFoundationTrayProps {
  foundations: FaceFoundation[];
  selectedLook: LookWithImages | null;
  onFaceClick: (faceUrl: string) => void;
  activeDragId: string | null;
}

interface DraggableFaceProps {
  foundation: FaceFoundation;
  onClick: () => void;
  isDragging: boolean;
}

function DraggableFace({ foundation, onClick, isDragging }: DraggableFaceProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: foundation.id,
    data: { faceUrl: foundation.stored_url, foundation },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50"
      )}
      {...listeners}
      {...attributes}
    >
      <button
        onClick={onClick}
        className="w-full aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary/50 transition-all"
      >
        <img
          src={foundation.stored_url}
          alt={foundation.view}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </button>
      
      {/* View label */}
      <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] py-0.5 text-center capitalize">
        {foundation.view}
      </span>

      {/* Drag handle indicator */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-white drop-shadow-md" />
      </div>
    </div>
  );
}

export function FaceFoundationTray({
  foundations,
  selectedLook,
  onFaceClick,
  activeDragId,
}: FaceFoundationTrayProps) {
  // Filter to only show foundations for the selected look's talent
  const talentFoundations = selectedLook
    ? foundations.filter(f => f.digital_talent_id === selectedLook.digital_talent_id)
    : foundations;

  // Group by view type
  const groupedFoundations = talentFoundations.reduce((acc, foundation) => {
    const view = foundation.view || 'other';
    if (!acc[view]) acc[view] = [];
    acc[view].push(foundation);
    return acc;
  }, {} as Record<string, FaceFoundation[]>);

  const viewOrder = ['front', 'side', 'back', 'other', 'unknown'];

  if (talentFoundations.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b bg-muted/30">
          <h3 className="text-sm font-medium">Face Foundations</h3>
          <p className="text-xs text-muted-foreground">Drag to pair</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-sm text-muted-foreground">
            {selectedLook
              ? "No face foundations for this talent. Create them in Talent Face Library first."
              : "Select a look to see available faces"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-medium">Face Foundations</h3>
        <p className="text-xs text-muted-foreground">
          {talentFoundations.length} available • Drag or click to pair
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {viewOrder.map(view => {
          const viewFoundations = groupedFoundations[view];
          if (!viewFoundations || viewFoundations.length === 0) return null;

          return (
            <div key={view}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 capitalize">
                {view} View
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {viewFoundations.map(foundation => (
                  <DraggableFace
                    key={foundation.id}
                    foundation={foundation}
                    onClick={() => onFaceClick(foundation.stored_url)}
                    isDragging={activeDragId === foundation.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
