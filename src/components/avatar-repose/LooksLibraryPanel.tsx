import { useState, useEffect, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Upload, ChevronDown, Palette, User } from "lucide-react";
import { toast } from "sonner";
import type { TalentImage, TalentView } from "@/types/avatar-repose";
import type { DigitalTalent } from "@/types/digital-talent";

interface Look {
  id: string;
  talent_id: string;
  digital_talent_id: string | null;
  name: string;
  product_type: 'tops' | 'bottoms' | null;
  created_at: string;
}

const VIEWS: TalentView[] = ["front", "back", "detail", "side"];
const VIEW_LABELS: Record<TalentView, string> = {
  front: "Front",
  back: "Back",
  detail: "Detail",
  side: "Side",
};

export function LooksLibraryPanel() {
  const [looks, setLooks] = useState<Look[]>([]);
  const [lookImages, setLookImages] = useState<Record<string, TalentImage[]>>({});
  const [digitalTalents, setDigitalTalents] = useState<DigitalTalent[]>([]);
  const [newLookName, setNewLookName] = useState("");
  const [newLookProductType, setNewLookProductType] = useState<'tops' | 'bottoms'>('tops');
  const [newLookDigitalTalentId, setNewLookDigitalTalentId] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLooks, setExpandedLooks] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchLooks();
    fetchDigitalTalents();
  }, []);

  const fetchDigitalTalents = async () => {
    const { data } = await supabase
      .from("digital_talents")
      .select("*")
      .order("name");
    
    if (data) {
      setDigitalTalents(data);
    }
  };

  const fetchLooks = async () => {
    const { data: looksData } = await supabase
      .from("talent_looks")
      .select("*")
      .order("created_at", { ascending: false });

    if (looksData) {
      setLooks(looksData as Look[]);
      setExpandedLooks(new Set(looksData.map(l => l.id)));

      // Fetch images for each look
      for (const look of looksData) {
        const { data: imagesData } = await supabase
          .from("talent_images")
          .select("*")
          .eq("look_id", look.id);

        if (imagesData) {
          setLookImages((prev) => ({ ...prev, [look.id]: imagesData }));
        }
      }
    }
  };

  const handleCreateLook = async () => {
    if (!newLookName.trim()) {
      toast.error("Please enter a look name");
      return;
    }

    setIsCreating(true);

    try {
      // We need a talent_id for backwards compatibility - use or create a placeholder
      let talentId: string;
      
      if (newLookDigitalTalentId) {
        talentId = newLookDigitalTalentId;
      } else {
        // Get or create a placeholder talent
        const { data: existingTalent } = await supabase
          .from("talents")
          .select("id")
          .eq("name", "__placeholder__")
          .single();

        if (existingTalent) {
          talentId = existingTalent.id;
        } else {
          const { data: newTalent, error } = await supabase
            .from("talents")
            .insert({ name: "__placeholder__" })
            .select()
            .single();

          if (error || !newTalent) throw error || new Error("Failed to create placeholder");
          talentId = newTalent.id;
        }
      }

      const { error } = await supabase.from("talent_looks").insert({
        talent_id: talentId,
        digital_talent_id: newLookDigitalTalentId || null,
        name: newLookName,
        product_type: newLookProductType,
      });

      if (error) throw error;

      toast.success("Look created");
      setNewLookName("");
      setNewLookProductType("tops");
      setNewLookDigitalTalentId("");
      fetchLooks();
    } catch (err) {
      console.error("Error creating look:", err);
      toast.error("Failed to create look");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteLook = async (lookId: string) => {
    try {
      await supabase.from("talent_looks").delete().eq("id", lookId);
      toast.success("Look deleted");
      fetchLooks();
    } catch (err) {
      toast.error("Failed to delete look");
    }
  };

  const handleUpdateLookProductType = async (lookId: string, productType: 'tops' | 'bottoms') => {
    try {
      await supabase
        .from("talent_looks")
        .update({ product_type: productType })
        .eq("id", lookId);
      
      toast.success(`Updated to ${productType}`);
      fetchLooks();
    } catch (err) {
      toast.error("Failed to update product type");
    }
  };

  const handleUpdateDigitalTalent = async (lookId: string, digitalTalentId: string | null) => {
    try {
      await supabase
        .from("talent_looks")
        .update({ digital_talent_id: digitalTalentId })
        .eq("id", lookId);
      
      toast.success("Digital talent updated");
      fetchLooks();
    } catch (err) {
      toast.error("Failed to update digital talent");
    }
  };

  const handleUploadImage = async (lookId: string, talentId: string, view: TalentView, file: File) => {
    try {
      const fileName = `looks/${lookId}/${view}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Check if image for this view already exists
      const existingImages = lookImages[lookId] || [];
      const existing = existingImages.find((img) => img.view === view);

      if (existing) {
        await supabase
          .from("talent_images")
          .update({ stored_url: publicUrl })
          .eq("id", existing.id);
      } else {
        await supabase.from("talent_images").insert({
          talent_id: talentId,
          look_id: lookId,
          view,
          stored_url: publicUrl,
        });
      }

      toast.success(`${VIEW_LABELS[view]} image uploaded`);
      fetchLooks();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image");
    }
  };

  const getImageForView = (lookId: string, view: TalentView) => {
    const images = lookImages[lookId] || [];
    return images.find((img) => img.view === view);
  };

  const toggleExpanded = (lookId: string) => {
    setExpandedLooks((prev) => {
      const next = new Set(prev);
      if (next.has(lookId)) {
        next.delete(lookId);
      } else {
        next.add(lookId);
      }
      return next;
    });
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, inputId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(inputId);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, lookId: string, talentId: string, view: TalentView) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleUploadImage(lookId, talentId, view, file);
      } else {
        toast.error("Please drop an image file");
      }
    }
  };

  const getDigitalTalentById = (id: string | null) => {
    return digitalTalents.find(t => t.id === id);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Create Look */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Add New Look</h3>
        <div className="grid md:grid-cols-5 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Look Name</Label>
            <Input
              value={newLookName}
              onChange={(e) => setNewLookName(e.target.value)}
              placeholder="e.g. Summer Casual, Office, Beach"
            />
          </div>
          <div className="space-y-2">
            <Label>Product Type</Label>
            <Select value={newLookProductType} onValueChange={(v: 'tops' | 'bottoms') => setNewLookProductType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tops">Tops</SelectItem>
                <SelectItem value="bottoms">Bottoms</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Digital Talent (optional)</Label>
            <Select value={newLookDigitalTalentId || "none"} onValueChange={(v) => setNewLookDigitalTalentId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select talent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {digitalTalents.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleCreateLook}
              disabled={isCreating}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Look
            </Button>
          </div>
        </div>
      </Card>

      {/* Looks List */}
      <div className="space-y-4">
        {looks.map((look) => {
          const isExpanded = expandedLooks.has(look.id);
          const linkedTalent = getDigitalTalentById(look.digital_talent_id);

          return (
            <Card key={look.id} className="overflow-hidden">
              <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(look.id)}>
                <CollapsibleTrigger asChild>
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Palette className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{look.name}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs capitalize">
                            {look.product_type || 'No type'}
                          </Badge>
                          {linkedTalent && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <User className="w-3 h-3" />
                              {linkedTalent.name}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLook(look.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    {/* Look Settings */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Product Type:</Label>
                        <Select
                          value={look.product_type || ''}
                          onValueChange={(v: 'tops' | 'bottoms') => handleUpdateLookProductType(look.id, v)}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tops">Tops</SelectItem>
                            <SelectItem value="bottoms">Bottoms</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Digital Talent:</Label>
                        <Select
                          value={look.digital_talent_id || "none"}
                          onValueChange={(v) => handleUpdateDigitalTalent(look.id, v === "none" ? null : v)}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {digitalTalents.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Image slots */}
                    <div className="grid grid-cols-4 gap-3">
                      {VIEWS.map((view) => {
                        const image = getImageForView(look.id, view);
                        const inputId = `${look.id}-${view}`;

                        return (
                          <div key={view} className="space-y-1">
                            <p className="text-xs text-muted-foreground text-center">
                              {VIEW_LABELS[view]}
                            </p>
                            <div
                              className={`aspect-[3/4] rounded-lg border-2 border-dashed bg-background overflow-hidden cursor-pointer transition-colors ${
                                dragOver === inputId 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-border hover:border-primary/50'
                              }`}
                              onClick={() => fileInputRefs.current[inputId]?.click()}
                              onDragOver={(e) => handleDragOver(e, inputId)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, look.id, look.talent_id, view)}
                            >
                              {image ? (
                                <img
                                  src={image.stored_url}
                                  alt={`${look.name} ${view}`}
                                  className="w-full h-full object-cover pointer-events-none"
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                  <Upload className="w-5 h-5 mb-1" />
                                  <span className="text-[10px]">Drop or click</span>
                                </div>
                              )}
                            </div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => { fileInputRefs.current[inputId] = el; }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadImage(look.id, look.talent_id, view, file);
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}

        {looks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No looks created yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
