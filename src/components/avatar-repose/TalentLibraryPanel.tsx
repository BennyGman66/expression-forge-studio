import { useState, useEffect, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, Upload, User, ChevronDown, Palette } from "lucide-react";
import { toast } from "sonner";
import type { Talent, TalentImage, TalentView } from "@/types/avatar-repose";

interface TalentLook {
  id: string;
  talent_id: string;
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

export function TalentLibraryPanel() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [talentLooks, setTalentLooks] = useState<Record<string, TalentLook[]>>({});
  const [lookImages, setLookImages] = useState<Record<string, TalentImage[]>>({});
  const [newTalentName, setNewTalentName] = useState("");
  const [newTalentGender, setNewTalentGender] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [newLookNames, setNewLookNames] = useState<Record<string, string>>({});
  const [newLookProductTypes, setNewLookProductTypes] = useState<Record<string, 'tops' | 'bottoms'>>({});
  const [expandedTalents, setExpandedTalents] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetchTalents();
  }, []);

  const fetchTalents = async () => {
    const { data: talentsData } = await supabase
      .from("talents")
      .select("*")
      .order("created_at", { ascending: false });

    if (talentsData) {
      setTalents(talentsData);
      // Auto-expand all talents
      setExpandedTalents(new Set(talentsData.map(t => t.id)));

      // Fetch looks for each talent
      for (const talent of talentsData) {
        await fetchLooksForTalent(talent.id);
      }
    }
  };

  const fetchLooksForTalent = async (talentId: string) => {
    const { data: looksData } = await supabase
      .from("talent_looks")
      .select("*")
      .eq("talent_id", talentId)
      .order("created_at", { ascending: true });

    if (looksData) {
      setTalentLooks((prev) => ({ ...prev, [talentId]: looksData as TalentLook[] }));

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

  const handleCreateTalent = async () => {
    if (!newTalentName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    if (talents.length >= 10) {
      toast.error("Maximum 10 talents allowed");
      return;
    }

    setIsCreating(true);

    try {
      const { data: talent, error } = await supabase.from("talents").insert({
        name: newTalentName,
        gender: newTalentGender || null,
      }).select().single();

      if (error) throw error;

      // Auto-create a default "Look 1" for new talents
      if (talent) {
        await supabase.from("talent_looks").insert({
          talent_id: talent.id,
          name: "Look 1",
          product_type: "tops",
        });
      }

      toast.success("Talent created");
      setNewTalentName("");
      setNewTalentGender("");
      fetchTalents();
    } catch (err) {
      toast.error("Failed to create talent");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTalent = async (talentId: string) => {
    try {
      await supabase.from("talents").delete().eq("id", talentId);
      setTalents((prev) => prev.filter((t) => t.id !== talentId));
      toast.success("Talent deleted");
    } catch (err) {
      toast.error("Failed to delete talent");
    }
  };

  const handleAddLook = async (talentId: string) => {
    const lookName = newLookNames[talentId]?.trim();
    if (!lookName) {
      toast.error("Please enter a look name");
      return;
    }

    const productType = newLookProductTypes[talentId] || 'tops';

    try {
      await supabase.from("talent_looks").insert({
        talent_id: talentId,
        name: lookName,
        product_type: productType,
      });

      setNewLookNames((prev) => ({ ...prev, [talentId]: "" }));
      setNewLookProductTypes((prev) => ({ ...prev, [talentId]: 'tops' }));
      toast.success("Look added");
      fetchLooksForTalent(talentId);
    } catch (err) {
      toast.error("Failed to add look");
    }
  };

  const handleUpdateLookProductType = async (lookId: string, talentId: string, productType: 'tops' | 'bottoms') => {
    try {
      await supabase
        .from("talent_looks")
        .update({ product_type: productType })
        .eq("id", lookId);
      
      toast.success(`Updated to ${productType}`);
      fetchLooksForTalent(talentId);
    } catch (err) {
      toast.error("Failed to update product type");
    }
  };

  const handleDeleteLook = async (lookId: string, talentId: string) => {
    try {
      await supabase.from("talent_looks").delete().eq("id", lookId);
      toast.success("Look deleted");
      fetchLooksForTalent(talentId);
    } catch (err) {
      toast.error("Failed to delete look");
    }
  };

  const handleUploadImage = async (lookId: string, talentId: string, view: TalentView, file: File) => {
    try {
      const fileName = `talents/${talentId}/looks/${lookId}/${view}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Check if image for this view already exists for this look
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
      fetchLooksForTalent(talentId);
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image");
    }
  };

  const getImageForView = (lookId: string, view: TalentView) => {
    const images = lookImages[lookId] || [];
    return images.find((img) => img.view === view);
  };

  const toggleExpanded = (talentId: string) => {
    setExpandedTalents((prev) => {
      const next = new Set(prev);
      if (next.has(talentId)) {
        next.delete(talentId);
      } else {
        next.add(talentId);
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Create Talent */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Add Digital Talent</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Name</Label>
            <Input
              value={newTalentName}
              onChange={(e) => setNewTalentName(e.target.value)}
              placeholder="Talent name"
            />
          </div>
          <div className="space-y-2">
            <Label>Gender (optional)</Label>
            <Select value={newTalentGender} onValueChange={setNewTalentGender}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleCreateTalent}
              disabled={isCreating || talents.length >= 10}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Talent
            </Button>
          </div>
        </div>
      </Card>

      {/* Talent List */}
      <div className="space-y-4">
        {talents.map((talent) => {
          const looks = talentLooks[talent.id] || [];
          const isExpanded = expandedTalents.has(talent.id);

          return (
            <Card key={talent.id} className="overflow-hidden">
              <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(talent.id)}>
                <CollapsibleTrigger asChild>
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{talent.name}</h4>
                        <div className="flex items-center gap-2">
                          {talent.gender && (
                            <span className="text-xs text-muted-foreground capitalize">
                              {talent.gender}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {looks.length} look{looks.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTalent(talent.id);
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
                    {/* Add new look */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={newLookNames[talent.id] || ""}
                        onChange={(e) =>
                          setNewLookNames((prev) => ({ ...prev, [talent.id]: e.target.value }))
                        }
                        placeholder="New look name (e.g. Summer, Casual)"
                        className="flex-1"
                      />
                      <Select
                        value={newLookProductTypes[talent.id] || 'tops'}
                        onValueChange={(value: 'tops' | 'bottoms') =>
                          setNewLookProductTypes((prev) => ({ ...prev, [talent.id]: value }))
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tops">Tops</SelectItem>
                          <SelectItem value="bottoms">Bottoms</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddLook(talent.id)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Look
                      </Button>
                    </div>

                    {/* Looks grid */}
                    <div className="space-y-4">
                      {looks.map((look) => (
                        <div key={look.id} className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Palette className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{look.name}</span>
                              <Select
                                value={look.product_type || ''}
                                onValueChange={(value: 'tops' | 'bottoms') => 
                                  handleUpdateLookProductType(look.id, talent.id, value)
                                }
                              >
                                <SelectTrigger className={`h-6 w-28 text-xs ${!look.product_type ? 'border-amber-500' : ''}`}>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tops">Tops</SelectItem>
                                  <SelectItem value="bottoms">Bottoms</SelectItem>
                                </SelectContent>
                              </Select>
                              {!look.product_type && (
                                <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs h-6">
                                  ⚠️ Set type
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteLook(look.id, talent.id)}
                              className="h-7 w-7 p-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Image slots for this look */}
                          <div className="grid grid-cols-4 gap-2">
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
                                    onDrop={(e) => handleDrop(e, look.id, talent.id, view)}
                                  >
                                    {image ? (
                                      <img
                                        src={image.stored_url}
                                        alt={`${talent.name} ${look.name} ${view}`}
                                        className="w-full h-full object-cover pointer-events-none"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                                        <Upload className="w-4 h-4 mb-1" />
                                        <span className="text-[10px]">
                                          {dragOver === inputId ? 'Drop here' : 'Drop or click'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    ref={(el) => (fileInputRefs.current[inputId] = el)}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadImage(look.id, talent.id, view, file);
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {looks.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground text-sm">
                          No looks added yet. Add a look above to upload reference images.
                        </div>
                      )}
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {talents.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No digital talents added yet</p>
          <p className="text-sm">Create talents and add multiple looks with reference images</p>
        </Card>
      )}
    </div>
  );
}
