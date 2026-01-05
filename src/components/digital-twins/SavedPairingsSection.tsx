import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, User, Clock, ArrowRight, Loader2, Star } from "lucide-react";
import { usePairingTemplates } from "@/hooks/usePairingTemplates";
import { formatDistanceToNow } from "date-fns";

interface SavedPairingsSectionProps {
  digitalTalentId: string;
}

export function SavedPairingsSection({ digitalTalentId }: SavedPairingsSectionProps) {
  const { templates, loading, deleteTemplate } = usePairingTemplates(digitalTalentId);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (templateId: string) => {
    setDeletingId(templateId);
    await deleteTemplate(templateId);
    setDeletingId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-4">
        No saved pairings
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map(template => (
        <div
          key={template.id}
          className="flex items-center gap-3 p-2 rounded-md border bg-card group"
        >
          {/* Source model icon */}
          <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
            {template.digital_twin?.representative_image_url ? (
              <img 
                src={template.digital_twin.representative_image_url} 
                alt="" 
                className="w-full h-full object-cover" 
              />
            ) : template.face_identity ? (
              <div className="w-full h-full flex items-center justify-center bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">
              {template.digital_twin?.name || template.face_identity?.name || template.name}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {template.last_used_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(template.last_used_at), { addSuffix: true })}
                </span>
              )}
              {template.usage_count > 0 && (
                <span>· {template.usage_count}×</span>
              )}
            </div>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100"
            onClick={() => handleDelete(template.id)}
            disabled={deletingId === template.id}
          >
            {deletingId === template.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
