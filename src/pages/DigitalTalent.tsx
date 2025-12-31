import { useState, useEffect } from "react";
import { HubHeader } from "@/components/layout/HubHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, User, Upload, Trash2, Building2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useBrands } from "@/hooks/useBrands";
import type { DigitalTalent, DigitalTalentWithUsage } from "@/types/digital-talent";

export default function DigitalTalentPage() {
  const [activeTab, setActiveTab] = useState("talents");
  
  // Talents state
  const [talents, setTalents] = useState<DigitalTalentWithUsage[]>([]);
  const [selectedTalent, setSelectedTalent] = useState<DigitalTalentWithUsage | null>(null);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Brands state
  const { brands, loading: brandsLoading, createBrand, deleteBrand } = useBrands();
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandUrl, setNewBrandUrl] = useState("");
  const [isCreatingBrand, setIsCreatingBrand] = useState(false);

  useEffect(() => {
    fetchTalents();
  }, []);

  const fetchTalents = async () => {
    const { data: talentsData, error } = await supabase
      .from("digital_talents")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching talents:", error);
      return;
    }

    // Fetch all brand associations at once
    const { data: brandAssociations } = await supabase
      .from("digital_talent_brands")
      .select("talent_id, brand_id");

    const brandMap = new Map<string, string[]>();
    (brandAssociations || []).forEach((assoc) => {
      const existing = brandMap.get(assoc.talent_id) || [];
      existing.push(assoc.brand_id);
      brandMap.set(assoc.talent_id, existing);
    });

    const talentsWithUsage: DigitalTalentWithUsage[] = [];
    
    for (const talent of talentsData || []) {
      const { count: looksCount } = await supabase
        .from("talent_looks")
        .select("*", { count: "exact", head: true })
        .eq("digital_talent_id", talent.id);

      const { count: outputsCount } = await supabase
        .from("face_pairings")
        .select("*", { count: "exact", head: true })
        .eq("digital_talent_id", talent.id);

      talentsWithUsage.push({
        ...talent,
        looks_count: looksCount || 0,
        outputs_count: outputsCount || 0,
        brand_ids: brandMap.get(talent.id) || [],
      });
    }

    setTalents(talentsWithUsage);
  };

  const handleCreateTalent = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from("digital_talents")
        .insert({
          name: newName,
          gender: newGender || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Digital talent created");
      setNewName("");
      setNewGender("");
      fetchTalents();
    } catch (err) {
      console.error("Error creating talent:", err);
      toast.error("Failed to create talent");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTalent = async (talentId: string) => {
    try {
      const { error } = await supabase
        .from("digital_talents")
        .delete()
        .eq("id", talentId);

      if (error) throw error;

      toast.success("Digital talent deleted");
      if (selectedTalent?.id === talentId) {
        setSelectedTalent(null);
      }
      fetchTalents();
    } catch (err) {
      console.error("Error deleting talent:", err);
      toast.error("Failed to delete talent");
    }
  };

  const handleUploadFrontFace = async (talentId: string, file: File) => {
    setIsUploading(true);

    try {
      const fileName = `digital-talents/${talentId}/front-face-${Date.now()}.${file.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("images")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("digital_talents")
        .update({ front_face_url: publicUrl })
        .eq("id", talentId);

      if (updateError) throw updateError;

      await supabase.from("digital_talent_assets").insert({
        talent_id: talentId,
        asset_type: "front_face",
        stored_url: publicUrl,
      });

      toast.success("Front face uploaded");
      fetchTalents();
    } catch (err) {
      console.error("Error uploading:", err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) {
      toast.error("Please enter a brand name");
      return;
    }

    setIsCreatingBrand(true);
    await createBrand(newBrandName, newBrandUrl);
    setNewBrandName("");
    setNewBrandUrl("");
    setIsCreatingBrand(false);
  };

  const handleDeleteBrand = async (brandId: string) => {
    await deleteBrand(brandId);
  };

  const handleToggleBrand = async (talentId: string, brandId: string, isCurrentlyAssociated: boolean) => {
    try {
      if (isCurrentlyAssociated) {
        const { error } = await supabase
          .from("digital_talent_brands")
          .delete()
          .eq("talent_id", talentId)
          .eq("brand_id", brandId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("digital_talent_brands")
          .insert({ talent_id: talentId, brand_id: brandId });
        if (error) throw error;
      }
      
      // Update local state
      setTalents(prev => prev.map(t => {
        if (t.id !== talentId) return t;
        const newBrandIds = isCurrentlyAssociated
          ? t.brand_ids.filter(id => id !== brandId)
          : [...t.brand_ids, brandId];
        return { ...t, brand_ids: newBrandIds };
      }));
      
      // Update selected talent if applicable
      if (selectedTalent?.id === talentId) {
        setSelectedTalent(prev => {
          if (!prev) return prev;
          const newBrandIds = isCurrentlyAssociated
            ? prev.brand_ids.filter(id => id !== brandId)
            : [...prev.brand_ids, brandId];
          return { ...prev, brand_ids: newBrandIds };
        });
      }
    } catch (err) {
      console.error("Error toggling brand:", err);
      toast.error("Failed to update brand association");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader currentApp="Digital Talent" />

      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-serif">Digital Talent & Brands</h1>
            <p className="text-muted-foreground mt-1">
              Manage your digital talent identities and brands across the platform
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="talents" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Talents
                <Badge variant="secondary" className="ml-1">{talents.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="brands" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Brands
                <Badge variant="secondary" className="ml-1">{brands.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Talents Tab */}
            <TabsContent value="talents">
              <div className="grid grid-cols-3 gap-6">
                {/* Left: Create & List */}
                <div className="col-span-2 space-y-6">
                  {/* Create Talent */}
                  <Card className="p-6">
                    <h3 className="text-lg font-medium mb-4">Add Digital Talent</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Talent name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Gender</Label>
                        <Select value={newGender} onValueChange={setNewGender}>
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
                          disabled={isCreating}
                          className="w-full"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Talent
                        </Button>
                      </div>
                    </div>
                  </Card>

                  {/* Talent Grid */}
                  <div className="grid grid-cols-4 gap-4">
                    {talents.map((talent) => (
                      <Card
                        key={talent.id}
                        className={`p-4 cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${
                          selectedTalent?.id === talent.id ? "ring-2 ring-primary" : ""
                        }`}
                        onClick={() => setSelectedTalent(talent)}
                      >
                        <div className="aspect-square rounded-lg bg-muted mb-3 overflow-hidden relative group">
                          {talent.front_face_url ? (
                            <img
                              src={talent.front_face_url}
                              alt={talent.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <User className="w-12 h-12 text-muted-foreground" />
                            </div>
                          )}
                          <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                            <Upload className="w-6 h-6 text-white" />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadFrontFace(talent.id, file);
                              }}
                            />
                          </label>
                        </div>
                        <h4 className="font-medium truncate">{talent.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          {talent.gender && (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {talent.gender}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Brand selector */}
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value=""
                            onValueChange={(brandId) => {
                              const isAssociated = talent.brand_ids.includes(brandId);
                              handleToggleBrand(talent.id, brandId, isAssociated);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={talent.brand_ids.length > 0 ? `${talent.brand_ids.length} brand(s)` : "Add brands..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {brands.map((brand) => (
                                <SelectItem key={brand.id} value={brand.id}>
                                  <div className="flex items-center gap-2">
                                    {talent.brand_ids.includes(brand.id) && (
                                      <span className="text-primary">✓</span>
                                    )}
                                    {brand.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* Brand badges */}
                        {talent.brand_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {talent.brand_ids.slice(0, 2).map((brandId) => {
                              const brand = brands.find(b => b.id === brandId);
                              return brand ? (
                                <Badge key={brandId} variant="outline" className="text-[10px] px-1.5">
                                  {brand.name}
                                </Badge>
                              ) : null;
                            })}
                            {talent.brand_ids.length > 2 && (
                              <Badge variant="outline" className="text-[10px] px-1.5">
                                +{talent.brand_ids.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{talent.looks_count} looks</span>
                          <span>{talent.outputs_count} outputs</span>
                        </div>
                      </Card>
                    ))}

                    {talents.length === 0 && (
                      <div className="col-span-4 text-center py-12 text-muted-foreground">
                        No digital talents yet. Create one above.
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Detail Panel */}
                <div>
                  {selectedTalent ? (
                    <Card className="p-6 sticky top-6">
                      <div className="flex items-start justify-between mb-4">
                        <h3 className="text-lg font-medium">{selectedTalent.name}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteTalent(selectedTalent.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="aspect-square rounded-lg bg-muted mb-4 overflow-hidden">
                        {selectedTalent.front_face_url ? (
                          <img
                            src={selectedTalent.front_face_url}
                            alt={selectedTalent.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-16 h-16 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Gender</Label>
                          <p className="capitalize">{selectedTalent.gender || "Not specified"}</p>
                        </div>

                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-2">Usage Statistics</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold">{selectedTalent.looks_count}</p>
                              <p className="text-xs text-muted-foreground">Looks</p>
                            </div>
                            <div className="bg-muted/50 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold">{selectedTalent.outputs_count}</p>
                              <p className="text-xs text-muted-foreground">Outputs</p>
                            </div>
                          </div>
                        </div>

                        <div className="border-t pt-4">
                          <label className="block">
                            <Button variant="outline" className="w-full" disabled={isUploading}>
                              <Upload className="w-4 h-4 mr-2" />
                              {isUploading ? "Uploading..." : "Upload Front Face"}
                            </Button>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUploadFrontFace(selectedTalent.id, file);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-6 text-center text-muted-foreground">
                      <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Select a talent to view details</p>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Brands Tab */}
            <TabsContent value="brands">
              <div className="space-y-6">
                {/* Create Brand */}
                <Card className="p-6">
                  <h3 className="text-lg font-medium mb-4">Add Brand</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Brand Name</Label>
                      <Input
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        placeholder="e.g., Tommy Hilfiger"
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Website URL (optional)</Label>
                      <Input
                        value={newBrandUrl}
                        onChange={(e) => setNewBrandUrl(e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={handleCreateBrand}
                        disabled={isCreatingBrand}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Brand
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Brands Grid */}
                <div className="grid grid-cols-4 gap-4">
                  {brands.map((brand) => (
                    <Card key={brand.id} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-primary" />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteBrand(brand.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <h4 className="font-medium">{brand.name}</h4>
                      {brand.start_url && (
                        <a
                          href={brand.start_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {new URL(brand.start_url).hostname}
                        </a>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Added {new Date(brand.created_at).toLocaleDateString()}
                      </p>
                    </Card>
                  ))}

                  {brands.length === 0 && !brandsLoading && (
                    <div className="col-span-4 text-center py-12 text-muted-foreground">
                      No brands yet. Create one above to use across the platform.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
