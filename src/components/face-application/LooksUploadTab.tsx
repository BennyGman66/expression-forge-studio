import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Plus, ArrowRight, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LooksUploadTabProps {
  selectedLookId: string | null;
  setSelectedLookId: (id: string | null) => void;
  selectedTalentId: string | null;
  setSelectedTalentId: (id: string | null) => void;
  onContinue: () => void;
}

interface DigitalTalent {
  id: string;
  name: string;
  front_face_url: string | null;
}

interface TalentLook {
  id: string;
  name: string;
  product_type: string | null;
}

interface LookSourceImage {
  id: string;
  view: string;
  source_url: string;
}

const VIEWS = ['front', 'back', 'side', 'detail'] as const;

export function LooksUploadTab({
  selectedLookId,
  setSelectedLookId,
  selectedTalentId,
  setSelectedTalentId,
  onContinue,
}: LooksUploadTabProps) {
  const [talents, setTalents] = useState<DigitalTalent[]>([]);
  const [looks, setLooks] = useState<TalentLook[]>([]);
  const [sourceImages, setSourceImages] = useState<LookSourceImage[]>([]);
  const [newLookName, setNewLookName] = useState("");
  const [showNewLookForm, setShowNewLookForm] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Fetch digital talents
  useEffect(() => {
    const fetchTalents = async () => {
      const { data } = await supabase
        .from("digital_talents")
        .select("id, name, front_face_url")
        .order("name");
      if (data) setTalents(data);
    };
    fetchTalents();
  }, []);

  // Fetch looks for selected talent
  useEffect(() => {
    if (!selectedTalentId) {
      setLooks([]);
      return;
    }
    const fetchLooks = async () => {
      const { data } = await supabase
        .from("talent_looks")
        .select("id, name, product_type")
        .eq("digital_talent_id", selectedTalentId)
        .order("name");
      if (data) setLooks(data);
    };
    fetchLooks();
  }, [selectedTalentId]);

  // Fetch source images for selected look
  useEffect(() => {
    if (!selectedLookId) {
      setSourceImages([]);
      return;
    }
    const fetchSourceImages = async () => {
      const { data } = await supabase
        .from("look_source_images")
        .select("id, view, source_url")
        .eq("look_id", selectedLookId);
      if (data) setSourceImages(data);
    };
    fetchSourceImages();
  }, [selectedLookId]);

  const handleCreateLook = async () => {
    if (!selectedTalentId || !newLookName.trim()) return;
    
    // Get the talent_id from talents table (for legacy compatibility)
    const { data: talentData } = await supabase
      .from("talents")
      .select("id")
      .limit(1)
      .single();
    
    const talentId = talentData?.id;
    if (!talentId) {
      toast({ title: "Error", description: "No talent found", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("talent_looks")
      .insert({
        name: newLookName.trim(),
        digital_talent_id: selectedTalentId,
        talent_id: talentId,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    setLooks([...looks, data]);
    setSelectedLookId(data.id);
    setNewLookName("");
    setShowNewLookForm(false);
    toast({ title: "Look created", description: `"${data.name}" has been created.` });
  };

  const handleUpload = async (view: typeof VIEWS[number], file: File) => {
    if (!selectedLookId || !selectedTalentId) return;

    setUploading((prev) => ({ ...prev, [view]: true }));

    try {
      // Upload to storage
      const fileName = `${selectedLookId}/${view}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      // Check if image already exists for this view
      const existingImage = sourceImages.find((img) => img.view === view);

      if (existingImage) {
        // Update existing
        await supabase
          .from("look_source_images")
          .update({ source_url: urlData.publicUrl })
          .eq("id", existingImage.id);

        setSourceImages((prev) =>
          prev.map((img) =>
            img.id === existingImage.id
              ? { ...img, source_url: urlData.publicUrl }
              : img
          )
        );
      } else {
        // Insert new
        const { data: newImage } = await supabase
          .from("look_source_images")
          .insert({
            look_id: selectedLookId,
            digital_talent_id: selectedTalentId,
            view,
            source_url: urlData.publicUrl,
          })
          .select()
          .single();

        if (newImage) {
          setSourceImages((prev) => [...prev, newImage]);
        }
      }

      toast({ title: "Uploaded", description: `${view} image uploaded successfully.` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } finally {
      setUploading((prev) => ({ ...prev, [view]: false }));
    }
  };

  const getImageForView = (view: string) => {
    return sourceImages.find((img) => img.view === view)?.source_url;
  };

  const hasMinimumImages = sourceImages.length >= 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Left: Talent & Look Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Digital Talent & Look</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Digital Talent</Label>
              <Select value={selectedTalentId || ""} onValueChange={setSelectedTalentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a talent..." />
                </SelectTrigger>
                <SelectContent>
                  {talents.map((talent) => (
                    <SelectItem key={talent.id} value={talent.id}>
                      {talent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTalentId && (
              <div className="space-y-2">
                <Label>Look</Label>
                <Select value={selectedLookId || ""} onValueChange={setSelectedLookId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a look..." />
                  </SelectTrigger>
                  <SelectContent>
                    {looks.map((look) => (
                      <SelectItem key={look.id} value={look.id}>
                        {look.name} {look.product_type && `(${look.product_type})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!showNewLookForm ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => setShowNewLookForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Look
                  </Button>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Look name..."
                      value={newLookName}
                      onChange={(e) => setNewLookName(e.target.value)}
                    />
                    <Button size="sm" onClick={handleCreateLook}>
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNewLookForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {/* Quick-access look tabs */}
                {looks.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Label className="text-xs text-muted-foreground mb-2 block">Quick Access</Label>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {looks.map((look) => (
                        <Button
                          key={look.id}
                          variant={selectedLookId === look.id ? "default" : "outline"}
                          size="sm"
                          className="whitespace-nowrap flex-shrink-0"
                          onClick={() => setSelectedLookId(look.id)}
                        >
                          {look.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Upload Slots */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Look Images</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedLookId ? (
              <p className="text-muted-foreground text-center py-8">
                Select a talent and look to upload images
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {VIEWS.map((view) => {
                  const imageUrl = getImageForView(view);
                  const isDragOver = dragOver[view];
                  return (
                    <div key={view} className="space-y-2">
                      <Label className="capitalize">{view}</Label>
                      <label
                        className={`
                          relative aspect-[3/4] border-2 border-dashed rounded-lg 
                          flex items-center justify-center cursor-pointer
                          transition-all overflow-hidden
                          ${isDragOver ? "border-primary bg-primary/5 scale-[1.02]" : "hover:border-primary"}
                          ${imageUrl ? "border-solid border-muted" : "border-muted-foreground/30"}
                        `}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver((prev) => ({ ...prev, [view]: true }));
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver((prev) => ({ ...prev, [view]: true }));
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver((prev) => ({ ...prev, [view]: false }));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragOver((prev) => ({ ...prev, [view]: false }));
                          const file = e.dataTransfer.files?.[0];
                          if (file && file.type.startsWith('image/')) {
                            handleUpload(view, file);
                          }
                        }}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={view}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            {uploading[view] ? (
                              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                            ) : (
                              <>
                                <ImageIcon className="h-8 w-8" />
                                <span className="text-xs">{isDragOver ? "Drop here" : "Upload"}</span>
                              </>
                            )}
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading[view]}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(view, file);
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Continue Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!hasMinimumImages}
          onClick={onContinue}
        >
          Continue to Head Crop
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
