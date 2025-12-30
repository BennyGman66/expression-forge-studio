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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Play, RefreshCw, Check, X, Edit2, Download, Loader2 } from "lucide-react";
import type { PairingMode, FacePairingJob } from "@/types/face-pairing";

interface ImagePairingPanelProps {
  runId: string | null;
}

interface CroppedFace {
  id: string;
  source_url: string;
  stored_url: string | null;
  gender: string;
  identity_id: string | null;
  identity_name: string | null;
  view: string;
  brand_name: string;
}

interface TalentWithImages {
  id: string;
  name: string;
  gender: string | null;
  images: Array<{
    id: string;
    stored_url: string;
    view: string;
  }>;
}

export function ImagePairingPanel({ runId }: ImagePairingPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'select' | 'review'>('select');
  
  // Selection state
  const [croppedFaces, setCroppedFaces] = useState<CroppedFace[]>([]);
  const [talents, setTalents] = useState<TalentWithImages[]>([]);
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(new Set());
  const [selectedTalentImageIds, setSelectedTalentImageIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [identityFilter, setIdentityFilter] = useState<string>('all');
  const [viewFilter, setViewFilter] = useState<string>('all');
  
  // Pairing config
  const [pairingMode, setPairingMode] = useState<PairingMode>('one-to-one');
  const [attemptsPerPairing, setAttemptsPerPairing] = useState('1');
  const [batchName, setBatchName] = useState('');
  
  // Job state
  const [currentJob, setCurrentJob] = useState<FacePairingJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Load cropped faces and talents
  useEffect(() => {
    if (runId) {
      loadCroppedFaces();
    }
    loadTalents();
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

  const loadCroppedFaces = async () => {
    if (!runId) return;

    // Get images with crops and identity info
    const { data: images, error } = await supabase
      .from('face_scrape_images')
      .select(`
        id,
        source_url,
        stored_url,
        gender,
        face_crops!inner (
          id
        ),
        face_identity_images (
          identity_id,
          view,
          face_identities (
            id,
            name,
            gender
          )
        )
      `)
      .eq('scrape_run_id', runId)
      .not('face_crops', 'is', null);

    if (error) {
      console.error('Error loading cropped faces:', error);
      return;
    }

    // Get run info for brand name
    const { data: run } = await supabase
      .from('face_scrape_runs')
      .select('brand_name')
      .eq('id', runId)
      .single();

    const faces: CroppedFace[] = (images || []).map((img: any) => {
      const identityImage = img.face_identity_images?.[0];
      return {
        id: img.id,
        source_url: img.source_url,
        stored_url: img.stored_url,
        gender: img.gender || 'unknown',
        identity_id: identityImage?.identity_id || null,
        identity_name: identityImage?.face_identities?.name || null,
        view: identityImage?.view || 'unknown',
        brand_name: run?.brand_name || 'Unknown'
      };
    });

    setCroppedFaces(faces);
  };

  const loadTalents = async () => {
    const { data, error } = await supabase
      .from('talents')
      .select(`
        id,
        name,
        gender,
        talent_images (
          id,
          stored_url,
          view
        )
      `);

    if (error) {
      console.error('Error loading talents:', error);
      return;
    }

    const mappedTalents: TalentWithImages[] = (data || [])
      .filter((t: any) => t.talent_images?.length > 0)
      .map((t: any) => ({
        id: t.id,
        name: t.name,
        gender: t.gender,
        images: t.talent_images || []
      }));
    setTalents(mappedTalents);
  };

  // Filter cropped faces
  const filteredFaces = useMemo(() => {
    return croppedFaces.filter(face => {
      if (genderFilter !== 'all' && face.gender !== genderFilter) return false;
      if (identityFilter !== 'all' && face.identity_id !== identityFilter) return false;
      if (viewFilter !== 'all' && face.view !== viewFilter) return false;
      return true;
    });
  }, [croppedFaces, genderFilter, identityFilter, viewFilter]);

  // Get unique identities for filter
  const uniqueIdentities = useMemo(() => {
    const identities = new Map<string, string>();
    croppedFaces.forEach(face => {
      if (face.identity_id && face.identity_name) {
        identities.set(face.identity_id, face.identity_name);
      }
    });
    return Array.from(identities.entries());
  }, [croppedFaces]);

  // Calculate total pairings
  const totalPairings = useMemo(() => {
    const faceCount = selectedFaceIds.size;
    const talentImageCount = selectedTalentImageIds.size;
    
    if (faceCount === 0 || talentImageCount === 0) return 0;
    
    switch (pairingMode) {
      case 'one-to-one':
        return Math.min(faceCount, talentImageCount);
      case 'one-to-many':
      case 'many-to-one':
      case 'many-to-many':
        return faceCount * talentImageCount;
      default:
        return 0;
    }
  }, [selectedFaceIds.size, selectedTalentImageIds.size, pairingMode]);

  const toggleFaceSelection = (faceId: string) => {
    const newSelected = new Set(selectedFaceIds);
    if (newSelected.has(faceId)) {
      newSelected.delete(faceId);
    } else {
      newSelected.add(faceId);
    }
    setSelectedFaceIds(newSelected);
  };

  const toggleTalentImageSelection = (imageId: string) => {
    const newSelected = new Set(selectedTalentImageIds);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    setSelectedTalentImageIds(newSelected);
  };

  const selectAllFilteredFaces = () => {
    setSelectedFaceIds(new Set(filteredFaces.map(f => f.id)));
  };

  const clearFaceSelection = () => {
    setSelectedFaceIds(new Set());
  };

  const startGeneration = async () => {
    if (selectedFaceIds.size === 0 || selectedTalentImageIds.size === 0) {
      toast.error('Please select at least one cropped face and one talent image');
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
          pairing_mode: pairingMode,
          total_pairings: totalPairings,
          attempts_per_pairing: parseInt(attemptsPerPairing) || 1,
          status: 'pending'
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create pairings based on mode
      const faceIds = Array.from(selectedFaceIds);
      const talentImageIds = Array.from(selectedTalentImageIds);
      
      // Get talent info for each image
      const { data: talentImages } = await supabase
        .from('talent_images')
        .select('id, talent_id')
        .in('id', talentImageIds);

      const talentImageMap = new Map((talentImages || []).map(ti => [ti.id, ti.talent_id]));

      const pairings: Array<{
        job_id: string;
        cropped_face_id: string;
        talent_id: string;
        talent_image_id: string;
      }> = [];

      if (pairingMode === 'one-to-one') {
        const count = Math.min(faceIds.length, talentImageIds.length);
        for (let i = 0; i < count; i++) {
          pairings.push({
            job_id: job.id,
            cropped_face_id: faceIds[i],
            talent_id: talentImageMap.get(talentImageIds[i]) || '',
            talent_image_id: talentImageIds[i]
          });
        }
      } else {
        // Cross-product for all other modes
        for (const faceId of faceIds) {
          for (const imageId of talentImageIds) {
            pairings.push({
              job_id: job.id,
              cropped_face_id: faceId,
              talent_id: talentImageMap.get(imageId) || '',
              talent_image_id: imageId
            });
          }
        }
      }

      // Insert pairings
      const { error: pairingError } = await supabase
        .from('face_pairings')
        .insert(pairings);

      if (pairingError) throw pairingError;

      // Start outfit description generation
      const { error: fnError } = await supabase.functions.invoke('generate-outfit-description', {
        body: { jobId: job.id }
      });

      if (fnError) throw fnError;

      setCurrentJob(job as FacePairingJob);
      toast.success(`Started generation for ${pairings.length} pairings`);
      
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

          <div className="grid grid-cols-2 gap-6">
            {/* Left: Cropped Faces */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Cropped Model Faces</CardTitle>
                  <Badge variant="outline">{selectedFaceIds.size} selected</Badge>
                </div>
                
                {/* Filters */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={identityFilter} onValueChange={setIdentityFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Identity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Identities</SelectItem>
                      {uniqueIdentities.map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={viewFilter} onValueChange={setViewFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="View" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Views</SelectItem>
                      <SelectItem value="front">Front</SelectItem>
                      <SelectItem value="side">Side</SelectItem>
                      <SelectItem value="back">Back</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={selectAllFilteredFaces}>
                    Select All ({filteredFaces.length})
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearFaceSelection}>
                    Clear
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {!runId ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Select a scrape run to see cropped faces
                    </p>
                  ) : filteredFaces.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No cropped faces found. Run the Crop tool first.
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {filteredFaces.map(face => (
                        <div
                          key={face.id}
                          className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all ${
                            selectedFaceIds.has(face.id)
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                          onClick={() => toggleFaceSelection(face.id)}
                        >
                          <img
                            src={face.stored_url || face.source_url}
                            alt=""
                            className="w-full aspect-square object-cover"
                          />
                          {selectedFaceIds.has(face.id) && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 truncate">
                            {face.identity_name || face.gender}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Right: Digital Talents */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Digital Talents</CardTitle>
                  <Badge variant="outline">{selectedTalentImageIds.size} selected</Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <ScrollArea className="h-[450px]">
                  {talents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No digital talents found
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {talents.map(talent => (
                        <div key={talent.id} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{talent.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {talent.gender || 'unspecified'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {talent.images.map(img => (
                              <div
                                key={img.id}
                                className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all ${
                                  selectedTalentImageIds.has(img.id)
                                    ? 'border-primary ring-2 ring-primary/20'
                                    : 'border-transparent hover:border-muted-foreground/30'
                                }`}
                                onClick={() => toggleTalentImageSelection(img.id)}
                              >
                                <img
                                  src={img.stored_url}
                                  alt=""
                                  className="w-full aspect-square object-cover"
                                />
                                {selectedTalentImageIds.has(img.id) && (
                                  <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                    <Check className="h-3 w-3" />
                                  </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 text-center">
                                  {img.view}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Pairing Configuration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pairing Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Batch Name</Label>
                  <Input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="Untitled Batch"
                    className="h-9"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Pairing Mode</Label>
                  <Select value={pairingMode} onValueChange={(v) => setPairingMode(v as PairingMode)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one-to-one">One-to-One</SelectItem>
                      <SelectItem value="one-to-many">One-to-Many</SelectItem>
                      <SelectItem value="many-to-one">Many-to-One</SelectItem>
                      <SelectItem value="many-to-many">Many-to-Many (Cross)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Attempts per Pairing</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={attemptsPerPairing}
                    onChange={(e) => setAttemptsPerPairing(e.target.value)}
                    className="h-9"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs">Total Pairings</Label>
                  <div className="h-9 flex items-center px-3 rounded-md bg-muted text-sm font-medium">
                    {totalPairings} pairings × {attemptsPerPairing || 1} = {totalPairings * (parseInt(attemptsPerPairing) || 1)} outputs
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end mt-4">
                <Button
                  onClick={startGeneration}
                  disabled={isLoading || selectedFaceIds.size === 0 || selectedTalentImageIds.size === 0}
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
  const [outputs, setOutputs] = useState<any[]>([]);
  const [job, setJob] = useState<FacePairingJob | null>(null);
  const [groupBy, setGroupBy] = useState<'talent' | 'identity'>('talent');

  useEffect(() => {
    if (jobId) {
      loadData();
    }
  }, [jobId]);

  // Poll for updates when job is running
  useEffect(() => {
    if (!job || ['completed', 'failed'].includes(job.status)) return;

    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [job?.status]);

  const loadData = async () => {
    if (!jobId) return;

    // Load job
    const { data: jobData } = await supabase
      .from('face_pairing_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobData) setJob(jobData as FacePairingJob);

    // Load pairings with related data
    const { data: pairingData } = await supabase
      .from('face_pairings')
      .select(`
        *,
        face_scrape_images!cropped_face_id (
          id,
          source_url,
          stored_url,
          gender
        ),
        talents!talent_id (
          id,
          name,
          gender
        ),
        talent_images!talent_image_id (
          id,
          stored_url,
          view
        )
      `)
      .eq('job_id', jobId);

    if (pairingData) setPairings(pairingData);

    // Load outputs
    const { data: outputData } = await supabase
      .from('face_pairing_outputs')
      .select('*')
      .in('pairing_id', (pairingData || []).map((p: any) => p.id));

    if (outputData) setOutputs(outputData);
  };

  const getOutputsForPairing = (pairingId: string) => {
    return outputs.filter(o => o.pairing_id === pairingId);
  };

  if (!jobId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No generation job selected. Create pairings first.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job Status */}
      {job && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge 
                  variant={
                    job.status === 'completed' ? 'default' :
                    job.status === 'failed' ? 'destructive' :
                    'secondary'
                  }
                >
                  {job.status}
                </Badge>
                <span className="text-sm">{job.name}</span>
                <span className="text-sm text-muted-foreground">
                  {job.progress}/{job.total_pairings} processed
                </span>
              </div>
              
              {job.status === 'describing' && (
                <Button size="sm" onClick={onStartGeneration}>
                  <Play className="h-4 w-4 mr-2" />
                  Start Image Generation
                </Button>
              )}
            </div>
            
            {!['completed', 'failed'].includes(job.status) && (
              <Progress 
                value={job.total_pairings > 0 ? (job.progress / job.total_pairings) * 100 : 0}
                className="mt-3"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Group By Toggle */}
      <div className="flex items-center gap-2">
        <Label className="text-sm">Group by:</Label>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'talent' | 'identity')}>
          <SelectTrigger className="w-40 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="talent">Digital Talent</SelectItem>
            <SelectItem value="identity">Model Identity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results Grid */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-6">
          {pairings.map(pairing => (
            <Card key={pairing.id}>
              <CardContent className="pt-4">
                <div className="flex gap-4">
                  {/* Reference Images */}
                  <div className="flex gap-2">
                    <div className="w-20">
                      <img
                        src={pairing.face_scrape_images?.stored_url || pairing.face_scrape_images?.source_url}
                        alt="Cropped face"
                        className="w-full aspect-square object-cover rounded-md"
                      />
                      <p className="text-[10px] text-center mt-1 text-muted-foreground">Source</p>
                    </div>
                    <div className="w-20">
                      <img
                        src={pairing.talent_images?.stored_url}
                        alt="Talent"
                        className="w-full aspect-square object-cover rounded-md"
                      />
                      <p className="text-[10px] text-center mt-1 text-muted-foreground">
                        {pairing.talents?.name}
                      </p>
                    </div>
                  </div>

                  {/* Outfit Description */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Outfit Description</Label>
                      <Badge variant="outline" className="text-[10px]">
                        {pairing.outfit_description_status}
                      </Badge>
                    </div>
                    <p className="text-xs bg-muted p-2 rounded-md">
                      {pairing.outfit_description || 'Pending...'}
                    </p>
                  </div>

                  {/* Generated Outputs */}
                  <div className="flex gap-2">
                    {getOutputsForPairing(pairing.id).map(output => (
                      <div key={output.id} className="w-20">
                        {output.status === 'completed' && output.stored_url ? (
                          <img
                            src={output.stored_url}
                            alt="Generated"
                            className="w-full aspect-square object-cover rounded-md"
                          />
                        ) : output.status === 'running' ? (
                          <div className="w-full aspect-square bg-muted rounded-md flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : output.status === 'failed' ? (
                          <div className="w-full aspect-square bg-destructive/10 rounded-md flex items-center justify-center">
                            <X className="h-4 w-4 text-destructive" />
                          </div>
                        ) : (
                          <div className="w-full aspect-square bg-muted rounded-md" />
                        )}
                        <p className="text-[10px] text-center mt-1 text-muted-foreground">
                          #{output.attempt_index + 1}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
