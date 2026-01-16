import { LibraryPose, CurationStatus, OutputShotType, ALL_OUTPUT_SHOT_TYPES, OUTPUT_SHOT_LABELS, CropTarget } from "@/hooks/useLibraryPoses";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { X, CheckCircle2, XCircle, Move } from "lucide-react";

interface PoseInspectorProps {
  pose: LibraryPose | null;
  onClose: () => void;
  onUpdateStatus: (status: CurationStatus) => void;
  onMoveToShotType: (shotType: OutputShotType) => void;
  onSetCropTarget?: (cropTarget: CropTarget) => void;
  isLocked: boolean;
}

// Short labels for buttons
const SHORT_LABELS: Record<OutputShotType, string> = {
  FRONT_FULL: 'Front',
  FRONT_CROPPED: 'Crop',
  DETAIL: 'Detail',
  BACK_FULL: 'Back',
};

export function PoseInspector({
  pose,
  onClose,
  onUpdateStatus,
  onMoveToShotType,
  onSetCropTarget,
  isLocked,
}: PoseInspectorProps) {
  if (!pose) {
    return (
      <div className="w-72 flex-shrink-0 border-l bg-muted/30 p-4 flex items-center justify-center">
        <p className="text-sm text-muted-foreground text-center">
          Select a pose to inspect
        </p>
      </div>
    );
  }

  return (
    <div className="w-72 flex-shrink-0 border-l bg-muted/30 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-medium">Inspector</h3>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Image preview */}
      <div className="p-3">
        <img
          src={pose.clay_image_url || "/placeholder.svg"}
          alt="Pose preview"
          className="w-full aspect-[3/4] object-cover rounded-lg"
        />
      </div>

      {/* Metadata */}
      <div className="px-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Shot Type</span>
          <Badge variant="secondary" title={OUTPUT_SHOT_LABELS[pose.shotType]}>
            {SHORT_LABELS[pose.shotType]}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Gender</span>
          <Badge variant="outline">{pose.gender || "Unknown"}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Product</span>
          <Badge variant="outline">{pose.product_type || "Unknown"}</Badge>
        </div>
        {/* Show crop target for FRONT_CROPPED poses */}
        {pose.shotType === 'FRONT_CROPPED' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Crop Target</span>
            <Badge variant="outline" className="flex items-center gap-1">
              {pose.crop_target === 'top' ? '👕 Top' : pose.crop_target === 'trousers' ? '👖 Trousers' : 'Not set'}
            </Badge>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge
            variant={
              pose.curation_status === "included"
                ? "default"
                : pose.curation_status === "excluded"
                ? "destructive"
                : "secondary"
            }
          >
            {pose.curation_status}
          </Badge>
        </div>
      </div>

      <Separator className="my-3" />

      {/* Actions */}
      {!isLocked && (
        <div className="px-3 space-y-3">
          <div>
            <p className="text-sm font-medium mb-2">Curation</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={pose.curation_status === "included" ? "default" : "outline"}
                className="flex-1"
                onClick={() => onUpdateStatus("included")}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Include
              </Button>
              <Button
                size="sm"
                variant={pose.curation_status === "excluded" ? "destructive" : "outline"}
                className="flex-1"
                onClick={() => onUpdateStatus("excluded")}
              >
                <XCircle className="w-4 h-4 mr-1" />
                Exclude
              </Button>
            </div>
          </div>

          {/* Crop Target - only show for FRONT_CROPPED */}
          {pose.shotType === 'FRONT_CROPPED' && onSetCropTarget && (
            <div>
              <p className="text-sm font-medium mb-2">Crop Target</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={pose.crop_target === "top" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => onSetCropTarget("top")}
                >
                  👕 Top
                </Button>
                <Button
                  size="sm"
                  variant={pose.crop_target === "trousers" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => onSetCropTarget("trousers")}
                >
                  👖 Trousers
                </Button>
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium mb-2">Move to Shot Type</p>
            <div className="flex gap-1">
              {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
                <Button
                  key={shotType}
                  size="sm"
                  variant={pose.shotType === shotType ? "default" : "outline"}
                  className="flex-1 text-xs"
                  onClick={() => onMoveToShotType(shotType)}
                  disabled={pose.shotType === shotType}
                  title={OUTPUT_SHOT_LABELS[shotType]}
                >
                  {SHORT_LABELS[shotType]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="px-3">
          <p className="text-sm text-muted-foreground text-center py-4">
            This library is locked. Create a new version to make changes.
          </p>
        </div>
      )}
    </div>
  );
}
