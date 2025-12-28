import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Upload, User, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Talent, TalentImage, TalentView } from "@/types/avatar-repose";

const VIEWS: TalentView[] = ["front", "back", "detail", "side"];
const VIEW_LABELS: Record<TalentView, string> = {
  front: "Front",
  back: "Back",
  detail: "Detail",
  side: "Side",
};

export function TalentLibraryPanel() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [talentImages, setTalentImages] = useState<Record<string, TalentImage[]>>({});
  const [newTalentName, setNewTalentName] = useState("");
  const [newTalentGender, setNewTalentGender] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
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

      // Fetch images for each talent
      for (const talent of talentsData) {
        const { data: imagesData } = await supabase
          .from("talent_images")
          .select("*")
          .eq("talent_id", talent.id);

        if (imagesData) {
          setTalentImages((prev) => ({ ...prev, [talent.id]: imagesData }));
        }
      }
    }
  };

  const handleCreateTalent = async () => {
    if (!newTalentName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    if (talents.length >= 4) {
      toast.error("Maximum 4 talents allowed");
      return;
    }

    setIsCreating(true);

    try {
      const { error } = await supabase.from("talents").insert({
        name: newTalentName,
        gender: newTalentGender || null,
      });

      if (error) throw error;

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

  const handleUploadImage = async (talentId: string, view: TalentView, file: File) => {
    try {
      // Upload to storage
      const fileName = `talents/${talentId}/${view}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Check if image for this view already exists
      const existingImages = talentImages[talentId] || [];
      const existing = existingImages.find((img) => img.view === view);

      if (existing) {
        // Update existing
        await supabase
          .from("talent_images")
          .update({ stored_url: publicUrl })
          .eq("id", existing.id);
      } else {
        // Insert new
        await supabase.from("talent_images").insert({
          talent_id: talentId,
          view,
          stored_url: publicUrl,
        });
      }

      toast.success(`${VIEW_LABELS[view]} image uploaded`);
      fetchTalents();
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Failed to upload image");
    }
  };

  const getImageForView = (talentId: string, view: TalentView) => {
    const images = talentImages[talentId] || [];
    return images.find((img) => img.view === view);
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
              disabled={isCreating || talents.length >= 4}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Talent
            </Button>
          </div>
        </div>
        {talents.length >= 4 && (
          <p className="text-sm text-muted-foreground mt-2">
            Maximum 4 talents reached
          </p>
        )}
      </Card>

      {/* Talent List */}
      <div className="grid md:grid-cols-2 gap-6">
        {talents.map((talent) => (
          <Card key={talent.id} className="p-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">{talent.name}</h4>
                  {talent.gender && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {talent.gender}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteTalent(talent.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Image slots */}
            <div className="grid grid-cols-4 gap-2">
              {VIEWS.map((view) => {
                const image = getImageForView(talent.id, view);
                const inputId = `${talent.id}-${view}`;

                return (
                  <div key={view} className="space-y-1">
                    <p className="text-xs text-muted-foreground text-center">
                      {VIEW_LABELS[view]}
                    </p>
                    <div
                      className="aspect-[3/4] rounded-lg border-2 border-dashed border-border bg-muted/50 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRefs.current[inputId]?.click()}
                    >
                      {image ? (
                        <img
                          src={image.stored_url}
                          alt={`${talent.name} ${view}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <Upload className="w-4 h-4 mb-1" />
                          <span className="text-[10px]">Upload</span>
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
                        if (file) handleUploadImage(talent.id, view, file);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {talents.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No digital talents added yet</p>
          <p className="text-sm">Create up to 4 talents with reference images</p>
        </Card>
      )}
    </div>
  );
}
