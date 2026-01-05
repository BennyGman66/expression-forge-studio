import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, User, Clock, ArrowRight, Loader2 } from "lucide-react";
import { usePairingTemplates } from "@/hooks/usePairingTemplates";
import { PairingTemplateWithRelations } from "@/types/pairing-templates";
import { formatDistanceToNow } from "date-fns";

interface SavedPairingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoadPairing: (template: PairingTemplateWithRelations) => void;
}

export function SavedPairingsDialog({ open, onOpenChange, onLoadPairing }: SavedPairingsDialogProps) {
  const { templates, loading, deleteTemplate, recordUsage } = usePairingTemplates();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleLoad = async (template: PairingTemplateWithRelations) => {
    await recordUsage(template.id);
    onLoadPairing(template);
    onOpenChange(false);
  };

  const handleDelete = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    setDeletingId(templateId);
    await deleteTemplate(templateId);
    setDeletingId(null);
  };

  // Group templates by digital talent
  const groupedTemplates = templates.reduce((acc, template) => {
    const talentId = template.digital_talent_id;
    if (!acc[talentId]) {
      acc[talentId] = {
        talent: template.digital_talent,
        templates: []
      };
    }
    acc[talentId].templates.push(template);
    return acc;
  }, {} as Record<string, { talent: PairingTemplateWithRelations['digital_talent'], templates: PairingTemplateWithRelations[] }>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved Pairings</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              No saved pairings yet
            </div>
          ) : (
            <div className="space-y-6 pr-4">
              {Object.values(groupedTemplates).map(({ talent, templates: talentTemplates }) => (
                <div key={talent.id} className="space-y-2">
                  {/* Talent header */}
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-muted flex-shrink-0">
                      {talent.front_face_url ? (
                        <img src={talent.front_face_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <span>{talent.name}</span>
                    <Badge variant="secondary" className="text-xs capitalize">{talent.gender}</Badge>
                  </div>

                  {/* Templates for this talent */}
                  <div className="space-y-2 ml-8">
                    {talentTemplates.map(template => (
                      <div
                        key={template.id}
                        className="flex items-center gap-3 p-2 rounded-md border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
                        onClick={() => handleLoad(template)}
                      >
                        {/* Source model icon */}
                        <div className="w-8 h-8 rounded overflow-hidden bg-muted flex-shrink-0">
                          {template.digital_twin?.representative_image_url ? (
                            <img src={template.digital_twin.representative_image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{template.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {template.last_used_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(template.last_used_at), { addSuffix: true })}
                              </span>
                            )}
                            {template.usage_count > 0 && (
                              <span>· {template.usage_count} uses</span>
                            )}
                          </div>
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100"
                          onClick={(e) => handleDelete(e, template.id)}
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
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
