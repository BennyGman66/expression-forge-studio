import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Play, Check, Loader2, User, Plus, X, ArrowRight, Trash2, ChevronDown, ChevronUp, Users, UserPlus, UserCheck, Clock, Sparkles, Download } from "lucide-react";

// CroppedFacePreview component for displaying cropped faces using CSS transforms
function CroppedFacePreview({ imageUrl, crop }: { imageUrl: string; crop: { crop_x: number; crop_y: number; crop_width: number; crop_height: number; aspect_ratio?: string } }) {
  const scale = 100 / crop.crop_width;
  const translateX = -crop.crop_x * scale;
  const translateY = -crop.crop_y * scale;

  return (
    <div className="w-full h-full overflow-hidden relative">
      <img
        src={imageUrl}
        alt=""
        className="absolute origin-top-left"
        style={{
          transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
import type { FacePairingJob } from "@/types/face-pairing";
import type { DigitalTalent } from "@/types/digital-talent";
import { PromoteToTwinDialog } from "@/components/shared/PromoteToTwinDialog";

interface ImagePairingPanelProps {
  runId: string | null;
}

interface CroppedFace {
  id: string;
  scrape_image_id: string;
  source_url: string;
  stored_url: string | null;
  view: string;
  crop?: {
    crop_x: number;
    crop_y: number;
    crop_width: number;
    crop_height: number;
    aspect_ratio: string;
  };
}

interface IdentityForPairing {
  id: string;
  name: string;
  gender: string;
  imageCount: number;
  representativeImageUrl: string | null;
  images: CroppedFace[];
  linkedTwinId: string | null;
}

interface QueuedIdentityPairing {
  id: string;
  identity: IdentityForPairing;
  talent: DigitalTalent;
}

export function ImagePairingPanel({ runId }: ImagePairingPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'select' | 'review'>('select');
  
  // Identity-level selection
  const [identities, setIdentities] = useState<IdentityForPairing[]>([]);
  const [digitalTalents, setDigitalTalents] = useState<DigitalTalent[]>([]);
  const [selectedIdentityIds, setSelectedIdentityIds] = useState<Set<string>>(new Set());
  const [selectedTalentIds, setSelectedTalentIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [genderFilter, setGenderFilter] = useState<string>('all');
  
  // Pairing queue (identity-level)
  const [pairingQueue, setPairingQueue] = useState<QueuedIdentityPairing[]>([]);
  const [expandedPairings, setExpandedPairings] = useState<Set<string>>(new Set());
  const [attemptsPerPairing, setAttemptsPerPairing] = useState('1');
  const [batchName, setBatchName] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.5-flash-image-preview');
  
  // Job state
  const [currentJob, setCurrentJob] = useState<FacePairingJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Promote to twin dialog state
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [selectedIdentityForPromote, setSelectedIdentityForPromote] = useState<{
    id: string;
    name: string;
    gender: string;
    representativeImageUrl: string | null;
  } | null>(null);

  const handlePromoteClick = (e: React.MouseEvent, identity: IdentityForPairing) => {
    e.stopPropagation();
    setSelectedIdentityForPromote({
      id: identity.id,
      name: identity.name,
      gender: identity.gender,
      representativeImageUrl: identity.representativeImageUrl,
    });
    setPromoteDialogOpen(true);
  };

  const handlePromoteSuccess = (twinId: string, twinName: string) => {
    // Update the identity in local state to show it's linked to a twin and update name
    if (selectedIdentityForPromote) {
      setIdentities(prev => prev.map(i => 
        i.id === selectedIdentityForPromote.id 
          ? { ...i, linkedTwinId: twinId, name: twinName }
          : i
      ));
    }
    setPromoteDialogOpen(false);
    setSelectedIdentityForPromote(null);
  };
  
  // Load data
  useEffect(() => {
    if (runId) {
      loadIdentitiesWithImages();
    }
    loadDigitalTalents();
  }, [runId]);

  // Poll for job updates
  useEffect(() => {
    if (!currentJob || ['completed', 'failed'].includes(currentJob.status)) return;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('face_pairing_jobs')
        .select('*')
        .eq('id', currentJob.id)
        .single();
      
      if (data) {
        setCurrentJob(data as FacePairingJob);
        if (['completed', 'failed'].includes(data.status)) {
          toast.success(data.status === 'completed' ? 'Generation completed!' : 'Generation failed');
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentJob]);

  const loadIdentitiesWithImages = async () => {
    if (!runId) return;
    setIsLoadingData(true);

    try {
      // Load identities with their representative images
      const { data: identitiesData, error: identitiesError } = await supabase
        .from('face_identities')
        .select(`
          id,
          name,
          gender,
          image_count,
          representative_image_id,
          linked_twin_id,
          face_scrape_images!face_identities_representative_image_id_fkey (
            stored_url
          )
        `)
        .eq('scrape_run_id', runId)
        .order('name');

      if (identitiesError) throw identitiesError;

      // For each identity, load its cropped images
      const identitiesWithImages: IdentityForPairing[] = [];

      for (const identity of identitiesData || []) {
        // Get all images for this identity that have crops
        const { data: imagesData, error: imagesError } = await supabase
          .from('face_identity_images')
          .select(`
            id,
            view,
            scrape_image_id,
            face_scrape_images!inner (
              id,
              stored_url,
              source_url,
              face_crops (
                id,
                crop_x,
                crop_y,
                crop_width,
                crop_height,
                aspect_ratio
              )
            )
          `)
          .eq('identity_id', identity.id)
          .eq('is_ignored', false);

        if (imagesError) {
          console.error('Error loading identity images:', imagesError);
          continue;
        }

        // Filter to only images with crops
        const croppedImages: CroppedFace[] = [];
        for (const img of imagesData || []) {
          const scrapeImg = img.face_scrape_images as any;
          const crops = scrapeImg?.face_crops;
          if (crops && crops.length > 0) {
            const crop = crops[0];
            croppedImages.push({
              id: crop.id,
              scrape_image_id: scrapeImg.id,
              source_url: scrapeImg.source_url,
              stored_url: scrapeImg.stored_url,
              view: img.view || 'unknown',
              crop: {
                crop_x: crop.crop_x,
                crop_y: crop.crop_y,
                crop_width: crop.crop_width,
                crop_height: crop.crop_height,
                aspect_ratio: crop.aspect_ratio,
              },
            });
          }
        }

        if (croppedImages.length > 0) {
          const repImage = identity.face_scrape_images as any;
          identitiesWithImages.push({
            id: identity.id,
            name: identity.name,
            gender: identity.gender,
            imageCount: croppedImages.length,
            representativeImageUrl: repImage?.stored_url || croppedImages[0]?.stored_url || null,
            images: croppedImages,
            linkedTwinId: (identity as any).linked_twin_id || null,
          });
        }
      }

      setIdentities(identitiesWithImages);
    } catch (error) {
      console.error('Error loading identities:', error);
      toast.error('Failed to load model identities');
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadDigitalTalents = async () => {
    const { data, error } = await supabase
      .from('digital_talents')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error loading digital talents:', error);
      return;
    }

    setDigitalTalents(data || []);
  };

  // Filter identities
  const filteredIdentities = useMemo(() => {
    return identities.filter(identity => {
      if (genderFilter !== 'all' && identity.gender !== genderFilter) return false;
      return true;
    });
  }, [identities, genderFilter]);

  const toggleIdentitySelection = (identityId: string) => {
    setSelectedIdentityIds(prev => {
      const next = new Set(prev);
      if (next.has(identityId)) {
        next.delete(identityId);
      } else {
        next.add(identityId);
      }
      return next;
    });
  };

  const toggleTalentSelection = (talentId: string) => {
    setSelectedTalentIds(prev => {
      const next = new Set(prev);
      if (next.has(talentId)) {
        next.delete(talentId);
      } else {
        next.add(talentId);
      }
      return next;
    });
  };

  const selectAllFilteredIdentities = () => {
    setSelectedIdentityIds(new Set(filteredIdentities.map(i => i.id)));
  };

  const clearIdentitySelection = () => {
    setSelectedIdentityIds(new Set());
  };

  const selectAllTalents = () => {
    setSelectedTalentIds(new Set(digitalTalents.map(t => t.id)));
  };

  const clearTalentSelection = () => {
    setSelectedTalentIds(new Set());
  };

  // Add identity-level pairings to queue
  const addPairingsToQueue = () => {
    const selectedIdentities = identities.filter(i => selectedIdentityIds.has(i.id));
    const selectedTalents = digitalTalents.filter(t => selectedTalentIds.has(t.id));

    if (selectedIdentities.length === 0 || selectedTalents.length === 0) {
      toast.error('Select at least one model and one talent');
      return;
    }

    const newPairings: QueuedIdentityPairing[] = [];
    
    for (const identity of selectedIdentities) {
      for (const talent of selectedTalents) {
        // Check if this pairing already exists in queue
        const exists = pairingQueue.some(
          p => p.identity.id === identity.id && p.talent.id === talent.id
        );
        if (!exists) {
          newPairings.push({
            id: `${identity.id}-${talent.id}-${Date.now()}`,
            identity,
            talent
          });
        }
      }
    }

    if (newPairings.length === 0) {
      toast.info('All selected pairings already in queue');
      return;
    }

    setPairingQueue(prev => [...prev, ...newPairings]);
    setSelectedIdentityIds(new Set());
    setSelectedTalentIds(new Set());
    toast.success(`Added ${newPairings.length} pairing${newPairings.length > 1 ? 's' : ''} to queue`);
  };

  const removePairingFromQueue = (pairingId: string) => {
    setPairingQueue(prev => prev.filter(p => p.id !== pairingId));
    setExpandedPairings(prev => {
      const next = new Set(prev);
      next.delete(pairingId);
      return next;
    });
  };

  const clearQueue = () => {
    setPairingQueue([]);
    setExpandedPairings(new Set());
  };

  const togglePairingExpanded = (pairingId: string) => {
    setExpandedPairings(prev => {
      const next = new Set(prev);
      if (next.has(pairingId)) {
        next.delete(pairingId);
      } else {
        next.add(pairingId);
      }
      return next;
    });
  };

  // Calculate totals
  const potentialPairings = selectedIdentityIds.size * selectedTalentIds.size;
  const totalImages = pairingQueue.reduce((sum, p) => sum + p.identity.images.length, 0);
  const totalOutputs = totalImages * (parseInt(attemptsPerPairing) || 1);

  const startGeneration = async () => {
    if (pairingQueue.length === 0) {
      toast.error('Add pairings to the queue first');
      return;
    }

    setIsLoading(true);

    try {
      // Create job
      const { data: job, error: jobError } = await supabase
        .from('face_pairing_jobs')
        .insert({
          scrape_run_id: runId,
          name: batchName || `Batch ${new Date().toLocaleString()}`,
          pairing_mode: 'identity',
          total_pairings: totalImages,
          attempts_per_pairing: parseInt(attemptsPerPairing) || 1,
          model: selectedModel,
          status: 'pending'
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create individual pairings for each image in each identity
      const pairingsToInsert = [];

      for (const queuedPairing of pairingQueue) {
        for (const image of queuedPairing.identity.images) {
          pairingsToInsert.push({
            job_id: job.id,
            cropped_face_id: image.scrape_image_id,
            digital_talent_id: queuedPairing.talent.id,
            talent_id: null,
            talent_image_id: null,
            status: 'pending'
          });
        }
      }

      const { error: pairingError } = await supabase
        .from('face_pairings')
        .insert(pairingsToInsert);

      if (pairingError) throw pairingError;

      // Start outfit description generation
      const { error: fnError } = await supabase.functions.invoke('generate-outfit-description', {
        body: { jobId: job.id }
      });

      if (fnError) throw fnError;

      setCurrentJob(job as FacePairingJob);
      clearQueue();
      toast.success(`Started generation for ${pairingsToInsert.length} image pairings`);
      
      // Switch to review tab
      setActiveSubTab('review');

    } catch (error) {
      console.error('Error starting generation:', error);
      toast.error('Failed to start generation');
    } finally {
      setIsLoading(false);
    }
  };

  const startImageGeneration = async () => {
    if (!currentJob) return;

    try {
      const { error } = await supabase.functions.invoke('generate-paired-images', {
        body: { jobId: currentJob.id }
      });

      if (error) throw error;
      toast.success('Started image generation');
    } catch (error) {
      console.error('Error starting image generation:', error);
      toast.error('Failed to start image generation');
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'select' | 'review')}>
        <TabsList>
          <TabsTrigger value="select">Selection & Pairing</TabsTrigger>
          <TabsTrigger value="review">Output Review</TabsTrigger>
        </TabsList>

        <TabsContent value="select" className="space-y-6">
          {/* Job Progress */}
          {currentJob && !['completed', 'failed'].includes(currentJob.status) && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium capitalize">{currentJob.status}...</span>
                      <span className="text-sm text-muted-foreground">
                        {currentJob.progress}/{currentJob.total_pairings}
                      </span>
                    </div>
                    <Progress 
                      value={currentJob.total_pairings > 0 
                        ? (currentJob.progress / currentJob.total_pairings) * 100 
                        : 0
                      } 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
            {/* Left: Model Identities */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Model Identities
                  </CardTitle>
                  <Badge variant="outline">{selectedIdentityIds.size} selected</Badge>
                </div>
                
                {/* Filters */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={selectAllFilteredIdentities}>
                      All ({filteredIdentities.length})
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clearIdentitySelection}>
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {!runId ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Select a scrape run to see models
                    </p>
                  ) : isLoadingData ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredIdentities.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No cropped models found. Run Classify & Crop first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pr-4">
                      {filteredIdentities.map(identity => (
                        <div
                          key={identity.id}
                          className={`group relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            selectedIdentityIds.has(identity.id)
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                          onClick={() => toggleIdentitySelection(identity.id)}
                        >
                          {/* Representative Image - use first cropped face */}
                          <div className="bg-muted">
                          {identity.images.length > 0 && (identity.images[0].stored_url || identity.images[0].source_url) ? (
                              <CroppedFacePreview
                                imageUrl={identity.images[0].stored_url || identity.images[0].source_url}
                                crop={identity.images[0].crop}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          
                          {/* Selection indicator */}
                          {selectedIdentityIds.has(identity.id) && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-3 w-3" />
                            </div>
                          )}

                          {/* Promote to Twin button - only show if not already linked */}
                          {!identity.linkedTwinId && (
                            <Button
                              size="icon"
                              variant="secondary"
                              className="absolute top-2 left-2 h-7 w-7 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity shadow-md"
                              onClick={(e) => handlePromoteClick(e, identity)}
                              title="Promote to Digital Twin"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                          )}

                          {/* Twin linked indicator */}
                          {identity.linkedTwinId && (
                            <div className="absolute top-2 left-2 bg-emerald-500 text-white rounded-full p-1 shadow-md" title="Linked to Digital Twin">
                              <UserCheck className="h-3.5 w-3.5" />
                            </div>
                          )}
                          
                          {/* Info */}
                          <div className="p-2 bg-background">
                            <p className="font-medium text-sm truncate">{identity.name}</p>
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {identity.imageCount} images
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {identity.gender}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Center: Add Pairings Button */}
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <Button
                size="lg"
                onClick={addPairingsToQueue}
                disabled={selectedIdentityIds.size === 0 || selectedTalentIds.size === 0}
                className="flex flex-col h-auto py-4 px-6"
              >
                <Plus className="h-6 w-6 mb-1" />
                <span className="text-sm font-medium">
                  {potentialPairings > 0 
                    ? `Add ${potentialPairings} Pairing${potentialPairings > 1 ? 's' : ''}` 
                    : 'Add Pairings'
                  }
                </span>
              </Button>
              {potentialPairings > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {selectedIdentityIds.size} model{selectedIdentityIds.size > 1 ? 's' : ''} × {selectedTalentIds.size} talent{selectedTalentIds.size > 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Right: Digital Talents */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Digital Talents</CardTitle>
                  <Badge variant="outline">{selectedTalentIds.size} selected</Badge>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={selectAllTalents}>
                    Select All ({digitalTalents.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearTalentSelection}>
                    Clear
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {digitalTalents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No digital talents found. Create them in the Digital Talent app.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pr-4">
                      {digitalTalents.map(talent => (
                        <div
                          key={talent.id}
                          className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                            selectedTalentIds.has(talent.id)
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                          onClick={() => toggleTalentSelection(talent.id)}
                        >
                          <div className="aspect-square bg-muted">
                            {talent.front_face_url ? (
                              <img
                                src={talent.front_face_url}
                                alt={talent.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="w-8 h-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          {selectedTalentIds.has(talent.id) && (
                            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          <div className="p-2 bg-background">
                            <p className="font-medium text-sm truncate">{talent.name}</p>
                            {talent.gender && (
                              <Badge variant="secondary" className="text-xs capitalize mt-1">
                                {talent.gender}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Pairing Queue */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Pairing Queue</CardTitle>
                  {pairingQueue.length > 0 && (
                    <Badge>{pairingQueue.length} pairings • {totalImages} images</Badge>
                  )}
                </div>
                {pairingQueue.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearQueue}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pairingQueue.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <p className="text-sm">No pairings in queue</p>
                  <p className="text-xs mt-1">Select models and talents above, then click "Add Pairings"</p>
                </div>
              ) : (
                <>
                  {/* Queue items with expandable details */}
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 mb-4">
                    {pairingQueue.map(pairing => (
                      <Collapsible
                        key={pairing.id}
                        open={expandedPairings.has(pairing.id)}
                        onOpenChange={() => togglePairingExpanded(pairing.id)}
                      >
                        <div className="border rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            {/* Identity thumbnail */}
                            <div className="w-12 h-14 rounded overflow-hidden bg-muted flex-shrink-0">
                              {pairing.identity.representativeImageUrl ? (
                                <img
                                  src={pairing.identity.representativeImageUrl}
                                  alt={pairing.identity.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User className="w-5 h-5 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            {/* Identity info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{pairing.identity.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {pairing.identity.imageCount} images
                              </p>
                            </div>

                            <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                            {/* Talent thumbnail */}
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                              {pairing.talent.front_face_url ? (
                                <img
                                  src={pairing.talent.front_face_url}
                                  alt={pairing.talent.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            {/* Talent info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{pairing.talent.name}</p>
                            </div>

                            {/* Expand/collapse button */}
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                {expandedPairings.has(pairing.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>

                            {/* Remove button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                removePairingFromQueue(pairing.id);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Expanded image grid */}
                          <CollapsibleContent>
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs text-muted-foreground mb-2">
                                Images to be paired:
                              </p>
                              <div className="grid grid-cols-8 gap-2">
                                {pairing.identity.images.map((image) => (
                                  <div
                                    key={image.id}
                                    className="aspect-[4/5] rounded overflow-hidden bg-muted"
                                  >
                                    {image.crop ? (
                                      <CroppedFacePreview
                                        imageUrl={image.stored_url || image.source_url}
                                        crop={image.crop}
                                      />
                                    ) : (
                                      <img
                                        src={image.stored_url || image.source_url}
                                        alt=""
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </div>

                  {/* Configuration row */}
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <div className="flex items-center gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Batch Name</Label>
                        <Input
                          value={batchName}
                          onChange={(e) => setBatchName(e.target.value)}
                          placeholder="Untitled Batch"
                          className="h-8 w-40"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs">Attempts per Image</Label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={attemptsPerPairing}
                          onChange={(e) => setAttemptsPerPairing(e.target.value)}
                          className="h-8 w-20"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">AI Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="google/gemini-2.5-flash-image-preview">Nano (Fast)</SelectItem>
                            <SelectItem value="google/gemini-3-pro-image-preview">Nano Pro (Quality)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1">
                        <Label className="text-xs">Total Outputs</Label>
                        <div className="h-8 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                          {totalImages} × {attemptsPerPairing || 1} = {totalOutputs}
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      onClick={startGeneration}
                      disabled={isLoading || pairingQueue.length === 0}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Start Generation
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review">
          <ImagePairingReview 
            jobId={currentJob?.id || null} 
            onStartGeneration={startImageGeneration}
          />
        </TabsContent>
      </Tabs>

      {/* Promote to Twin Dialog */}
      <PromoteToTwinDialog
        open={promoteDialogOpen}
        onOpenChange={setPromoteDialogOpen}
        identityId={selectedIdentityForPromote?.id || ''}
        defaultName={selectedIdentityForPromote?.name || ''}
        defaultGender={selectedIdentityForPromote?.gender || null}
        representativeImageUrl={selectedIdentityForPromote?.representativeImageUrl || null}
        onSuccess={handlePromoteSuccess}
      />
    </div>
  );
}

// Output Review Component
interface ImagePairingReviewProps {
  jobId: string | null;
  onStartGeneration: () => void;
}

function ImagePairingReview({ jobId, onStartGeneration }: ImagePairingReviewProps) {
  const [pairings, setPairings] = useState<any[]>([]);
  const [outputs, setOutputs] = useState<Record<string, any[]>>({});
  const [job, setJob] = useState<FacePairingJob | null>(null);
  const [groupBy, setGroupBy] = useState<'talent' | 'identity'>('talent');
  const [totalOutputs, setTotalOutputs] = useState({ completed: 0, failed: 0, pending: 0, running: 0, total: 0 });
  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (jobId) {
      loadJobData();
    }
  }, [jobId]);

  // Realtime subscription for outputs and pairings
  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`pairing-review-${jobId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'face_pairing_outputs'
        },
        (payload) => {
          console.log('[ImagePairingReview] Output update:', payload.eventType);
          // Update outputs in real-time
          if (payload.eventType === 'INSERT') {
            handleNewOutput(payload.new as any);
          } else if (payload.eventType === 'UPDATE') {
            handleOutputUpdate(payload.new as any);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'face_pairings'
        },
        (payload) => {
          console.log('[ImagePairingReview] Pairing update:', payload.eventType);
          // Update pairing outfit descriptions in real-time
          if (payload.eventType === 'UPDATE') {
            handlePairingUpdate(payload.new as any);
          }
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'face_pairing_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          if (payload.new) {
            setJob(payload.new as FacePairingJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  // Handle new output inserted
  const handleNewOutput = (newOutput: any) => {
    setOutputs(prev => {
      const updated = { ...prev };
      if (!updated[newOutput.pairing_id]) {
        updated[newOutput.pairing_id] = [];
      }
      // Check if already exists
      const exists = updated[newOutput.pairing_id].some(o => o.id === newOutput.id);
      if (!exists) {
        updated[newOutput.pairing_id] = [...updated[newOutput.pairing_id], newOutput];
      }
      return updated;
    });
    recalculateTotals();
  };

  // Handle output status update
  const handleOutputUpdate = (updatedOutput: any) => {
    setOutputs(prev => {
      const updated = { ...prev };
      if (updated[updatedOutput.pairing_id]) {
        updated[updatedOutput.pairing_id] = updated[updatedOutput.pairing_id].map(o => 
          o.id === updatedOutput.id ? updatedOutput : o
        );
      }
      return updated;
    });
    recalculateTotals();
  };

  // Handle pairing outfit description update
  const handlePairingUpdate = (updatedPairing: any) => {
    setPairings(prev => prev.map(p => 
      p.id === updatedPairing.id 
        ? { ...p, outfit_description: updatedPairing.outfit_description, outfit_description_status: updatedPairing.outfit_description_status, status: updatedPairing.status }
        : p
    ));
  };

  // Recalculate totals from current outputs state
  const recalculateTotals = () => {
    setOutputs(currentOutputs => {
      let completed = 0, failed = 0, pending = 0, running = 0;
      Object.values(currentOutputs).forEach(pairingOutputs => {
        pairingOutputs.forEach(output => {
          if (output.status === 'completed') completed++;
          else if (output.status === 'failed') failed++;
          else if (output.status === 'running') running++;
          else pending++;
        });
      });
      const total = completed + failed + pending + running;
      setTotalOutputs({ completed, failed, pending, running, total });
      return currentOutputs;
    });
  };

  const loadJobData = async () => {
    if (!jobId) return;

    // Load job
    const { data: jobData } = await supabase
      .from('face_pairing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobData) {
      setJob(jobData as FacePairingJob);
    }

    // Load pairings with related data including face_crops
    const { data: pairingsData } = await supabase
      .from('face_pairings')
      .select(`
        *,
        face_scrape_images!cropped_face_id (
          id,
          stored_url,
          source_url,
          face_crops (
            cropped_stored_url,
            crop_x,
            crop_y,
            crop_width,
            crop_height,
            aspect_ratio
          ),
          face_identity_images (
            face_identities (
              id,
              name
            )
          )
        ),
        digital_talents!digital_talent_id (
          id,
          name,
          front_face_url
        )
      `)
      .eq('job_id', jobId);

    if (pairingsData) {
      setPairings(pairingsData);
    }

    await loadOutputs();
  };

  const loadOutputs = async () => {
    if (!jobId) return;

    // Load all outputs for this job
    const { data: allOutputs } = await supabase
      .from('face_pairing_outputs')
      .select('*, face_pairings!inner(job_id)')
      .eq('face_pairings.job_id', jobId)
      .order('created_at', { ascending: true });

    if (allOutputs) {
      // Group by pairing_id
      const outputsMap: Record<string, any[]> = {};
      let completed = 0, failed = 0, pending = 0, running = 0;

      for (const output of allOutputs) {
        if (!outputsMap[output.pairing_id]) {
          outputsMap[output.pairing_id] = [];
        }
        outputsMap[output.pairing_id].push(output);

        if (output.status === 'completed') completed++;
        else if (output.status === 'failed') failed++;
        else if (output.status === 'running') running++;
        else pending++;
      }

      setOutputs(outputsMap);
      setTotalOutputs({ completed, failed, pending, running, total: allOutputs.length });
    }
  };

  // Get status label and color
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pending', color: 'text-muted-foreground', icon: Clock };
      case 'describing':
        return { label: 'Analyzing Outfits', color: 'text-blue-500', icon: Loader2 };
      case 'generating':
        return { label: 'Generating Images', color: 'text-amber-500', icon: Loader2 };
      case 'completed':
        return { label: 'Completed', color: 'text-green-500', icon: Check };
      case 'failed':
        return { label: 'Failed', color: 'text-destructive', icon: X };
      default:
        return { label: status, color: 'text-muted-foreground', icon: Clock };
    }
  };

  // Toggle output selection
  const toggleOutputSelection = (outputId: string) => {
    setSelectedOutputs(prev => {
      const updated = new Set(prev);
      if (updated.has(outputId)) {
        updated.delete(outputId);
      } else {
        updated.add(outputId);
      }
      return updated;
    });
  };

  // Select all completed outputs
  const selectAllCompleted = () => {
    const completedIds: string[] = [];
    Object.values(outputs).forEach(pairingOutputs => {
      pairingOutputs.forEach(output => {
        if (output.status === 'completed' && output.stored_url) {
          completedIds.push(output.id);
        }
      });
    });
    setSelectedOutputs(new Set(completedIds));
  };

  // Download selected images
  const downloadSelected = () => {
    const urls: string[] = [];
    Object.values(outputs).forEach(pairingOutputs => {
      pairingOutputs.forEach(output => {
        if (selectedOutputs.has(output.id) && output.stored_url) {
          urls.push(output.stored_url);
        }
      });
    });
    
    // Download each image
    urls.forEach((url, index) => {
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = url;
        link.download = `output-${index + 1}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, index * 200);
    });
  };

  // Group pairings for display
  const getGroupedPairings = () => {
    if (groupBy === 'talent') {
      const groups: Record<string, { talent: any; pairings: any[] }> = {};
      pairings.forEach(p => {
        const talentId = p.digital_talents?.id || 'unknown';
        if (!groups[talentId]) {
          groups[talentId] = { talent: p.digital_talents, pairings: [] };
        }
        groups[talentId].pairings.push(p);
      });
      return Object.values(groups);
    } else {
      const groups: Record<string, { identity: any; pairings: any[] }> = {};
      pairings.forEach(p => {
        const identity = p.face_scrape_images?.face_identity_images?.[0]?.face_identities;
        const identityId = identity?.id || 'unknown';
        if (!groups[identityId]) {
          groups[identityId] = { identity, pairings: [] };
        }
        groups[identityId].pairings.push(p);
      });
      return Object.values(groups);
    }
  };

  if (!jobId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p>No generation job selected. Start a new generation to see results here.</p>
      </Card>
    );
  }

  const statusInfo = job ? getStatusInfo(job.status) : null;
  const StatusIcon = statusInfo?.icon || Clock;
  const groupedData = getGroupedPairings();
  const allCompletedOutputs = Object.values(outputs).flat().filter(o => o.status === 'completed');

  return (
    <div className="space-y-4">
      {/* Job Status Card */}
      {job && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{job.name}</h3>
                <Badge variant="outline" className={statusInfo?.color}>
                  {statusInfo?.label}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {job.status === 'describing' && (
                  <>
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Analyzing outfits: {pairings.filter(p => p.outfit_description_status === 'completed').length}/{pairings.length}
                    </span>
                  </>
                )}
                {job.status === 'generating' && (
                  <>
                    <span className="flex items-center gap-1 text-green-500">
                      <Check className="h-3 w-3" />
                      {totalOutputs.completed} completed
                    </span>
                    {totalOutputs.running > 0 && (
                      <span className="flex items-center gap-1 text-amber-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {totalOutputs.running} generating
                      </span>
                    )}
                    {totalOutputs.failed > 0 && (
                      <span className="flex items-center gap-1 text-destructive">
                        <X className="h-3 w-3" />
                        {totalOutputs.failed} failed
                      </span>
                    )}
                    <span>{totalOutputs.pending} pending</span>
                  </>
                )}
                {job.status === 'completed' && (
                  <>
                    <span>{totalOutputs.completed} images generated</span>
                    <span>{pairings.length} pairings</span>
                    {totalOutputs.failed > 0 && (
                      <span className="text-destructive">{totalOutputs.failed} failed</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {['generating', 'describing'].includes(job.status) && (
                <StatusIcon className={`h-5 w-5 animate-spin ${statusInfo?.color}`} />
              )}
              {job.status === 'completed' && (
                <Check className="h-5 w-5 text-green-500" />
              )}
              {job.status === 'failed' && (
                <X className="h-5 w-5 text-destructive" />
              )}
            </div>
          </div>
          
          {/* Progress bar */}
          {['generating', 'describing'].includes(job.status) && (
            <Progress 
              className="mt-3"
              value={
                job.status === 'generating' && totalOutputs.total > 0
                  ? ((totalOutputs.completed + totalOutputs.failed) / totalOutputs.total) * 100
                  : job.total_pairings > 0 
                    ? (pairings.filter(p => p.outfit_description_status === 'completed').length / job.total_pairings) * 100 
                    : 0
              } 
            />
          )}
        </Card>
      )}

      {/* Controls Row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button 
            variant={groupBy === 'talent' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setGroupBy('talent')}
          >
            <User className="h-3 w-3 mr-1" />
            Group by Talent
          </Button>
          <Button 
            variant={groupBy === 'identity' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setGroupBy('identity')}
          >
            <Users className="h-3 w-3 mr-1" />
            Group by Identity
          </Button>
        </div>
        
        {allCompletedOutputs.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAllCompleted}>
              Select All ({allCompletedOutputs.length})
            </Button>
            {selectedOutputs.size > 0 && (
              <Button size="sm" onClick={downloadSelected}>
                <Download className="h-3 w-3 mr-1" />
                Download ({selectedOutputs.size})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Grouped Results */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {groupedData.map((group, groupIndex) => {
            const groupLabel = groupBy === 'talent' 
              ? group.talent?.name || 'Unknown Talent'
              : group.identity?.name || 'Unknown Identity';
            
            const groupOutputs = group.pairings.flatMap(p => outputs[p.id] || []);
            const completedCount = groupOutputs.filter(o => o.status === 'completed').length;
            
            return (
              <Collapsible key={groupIndex} defaultOpen>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      {groupBy === 'talent' && group.talent?.front_face_url && (
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-muted">
                          <img src={group.talent.front_face_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <span className="font-medium">{groupLabel}</span>
                      <Badge variant="secondary" className="text-xs">
                        {completedCount}/{groupOutputs.length} outputs
                      </Badge>
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="grid grid-cols-6 gap-3 mt-3">
                    {group.pairings.map(pairing => {
                      const pairingOutputs = outputs[pairing.id] || [];
                      const sourceImage = pairing.face_scrape_images;
                      const faceCrop = sourceImage?.face_crops?.[0];
                      const croppedUrl = faceCrop?.cropped_stored_url;
                      const originalUrl = sourceImage?.stored_url || sourceImage?.source_url;

                      return pairingOutputs.map(output => (
                        <div 
                          key={output.id} 
                          className={`relative group aspect-[3/4] rounded-lg overflow-hidden bg-muted border-2 transition-colors cursor-pointer ${
                            selectedOutputs.has(output.id) ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                          onClick={() => output.status === 'completed' && toggleOutputSelection(output.id)}
                        >
                          {output.status === 'completed' && output.stored_url ? (
                            <>
                              <img 
                                src={output.stored_url} 
                                alt="" 
                                className="w-full h-full object-cover"
                              />
                              {/* Hover overlay with source images */}
                              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                                <div className="flex gap-1">
                                  <div className="w-8 h-10 rounded overflow-hidden bg-muted/20">
                                    {croppedUrl ? (
                                      <img src={croppedUrl} alt="Source" className="w-full h-full object-cover" />
                                    ) : faceCrop && originalUrl ? (
                                      <CroppedFacePreview imageUrl={originalUrl} crop={faceCrop} />
                                    ) : originalUrl ? (
                                      <img src={originalUrl} alt="Source" className="w-full h-full object-cover" />
                                    ) : null}
                                  </div>
                                  {pairing.digital_talents?.front_face_url && (
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted/20">
                                      <img src={pairing.digital_talents.front_face_url} alt="Talent" className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Selection indicator */}
                              {selectedOutputs.has(output.id) && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                </div>
                              )}
                            </>
                          ) : output.status === 'running' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                              <Loader2 className="h-6 w-6 animate-spin mb-2" />
                              <span className="text-xs">Generating...</span>
                            </div>
                          ) : output.status === 'failed' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center text-destructive">
                              <X className="h-6 w-6 mb-2" />
                              <span className="text-xs">Failed</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                              <Clock className="h-6 w-6 mb-2" />
                              <span className="text-xs">Pending</span>
                            </div>
                          )}
                        </div>
                      ));
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
