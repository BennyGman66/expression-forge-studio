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
import { toast } from "sonner";
import { Play, Check, Loader2, User } from "lucide-react";
import type { PairingMode, FacePairingJob } from "@/types/face-pairing";
import type { DigitalTalent } from "@/types/digital-talent";

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
  crop?: {
    crop_x: number;
    crop_y: number;
    crop_width: number;
    crop_height: number;
    aspect_ratio: string;
  };
}

export function ImagePairingPanel({ runId }: ImagePairingPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'select' | 'review'>('select');
  
  // Selection state
  const [croppedFaces, setCroppedFaces] = useState<CroppedFace[]>([]);
  const [digitalTalents, setDigitalTalents] = useState<DigitalTalent[]>([]);
  const [selectedFaceIds, setSelectedFaceIds] = useState<Set<string>>(new Set());
  const [selectedTalentIds, setSelectedTalentIds] = useState<Set<string>>(new Set());
  
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
  
  // Load cropped faces and digital talents
  useEffect(() => {
    if (runId) {
      loadCroppedFaces();
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

  const loadCroppedFaces = async () => {
    if (!runId) return;

    const { data: images, error } = await supabase
      .from('face_scrape_images')
      .select(`
        id,
        source_url,
        stored_url,
        gender,
        face_crops!inner (
          id,
          crop_x,
          crop_y,
          crop_width,
          crop_height,
          aspect_ratio
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

    const { data: run } = await supabase
      .from('face_scrape_runs')
      .select('brand_name')
      .eq('id', runId)
      .single();

    const faces: CroppedFace[] = (images || []).map((img: any) => {
      const identityImage = img.face_identity_images?.[0];
      const cropData = img.face_crops?.[0];
      return {
        id: img.id,
        source_url: img.source_url,
        stored_url: img.stored_url,
        gender: img.gender || 'unknown',
        identity_id: identityImage?.identity_id || null,
        identity_name: identityImage?.face_identities?.name || null,
        view: identityImage?.view || 'unknown',
        brand_name: run?.brand_name || 'Unknown',
        crop: cropData ? {
          crop_x: cropData.crop_x,
          crop_y: cropData.crop_y,
          crop_width: cropData.crop_width,
          crop_height: cropData.crop_height,
          aspect_ratio: cropData.aspect_ratio,
        } : undefined
      };
    });

    setCroppedFaces(faces);
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
    const talentCount = selectedTalentIds.size;
    
    if (faceCount === 0 || talentCount === 0) return 0;
    
    switch (pairingMode) {
      case 'one-to-one':
        return Math.min(faceCount, talentCount);
      case 'one-to-many':
      case 'many-to-one':
      case 'many-to-many':
        return faceCount * talentCount;
      default:
        return 0;
    }
  }, [selectedFaceIds.size, selectedTalentIds.size, pairingMode]);

  const toggleFaceSelection = (faceId: string) => {
    const newSelected = new Set(selectedFaceIds);
    if (newSelected.has(faceId)) {
      newSelected.delete(faceId);
    } else {
      newSelected.add(faceId);
    }
    setSelectedFaceIds(newSelected);
  };

  const toggleTalentSelection = (talentId: string) => {
    const newSelected = new Set(selectedTalentIds);
    if (newSelected.has(talentId)) {
      newSelected.delete(talentId);
    } else {
      newSelected.add(talentId);
    }
    setSelectedTalentIds(newSelected);
  };

  const selectAllFilteredFaces = () => {
    setSelectedFaceIds(new Set(filteredFaces.map(f => f.id)));
  };

  const clearFaceSelection = () => {
    setSelectedFaceIds(new Set());
  };

  const selectAllTalents = () => {
    setSelectedTalentIds(new Set(digitalTalents.map(t => t.id)));
  };

  const clearTalentSelection = () => {
    setSelectedTalentIds(new Set());
  };

  const startGeneration = async () => {
    if (selectedFaceIds.size === 0 || selectedTalentIds.size === 0) {
      toast.error('Please select at least one cropped face and one digital talent');
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
      const talentIds = Array.from(selectedTalentIds);

      const pairings: Array<{
        job_id: string;
        cropped_face_id: string;
        talent_id: string;
        talent_image_id: string;
        digital_talent_id: string;
      }> = [];

      if (pairingMode === 'one-to-one') {
        const count = Math.min(faceIds.length, talentIds.length);
        for (let i = 0; i < count; i++) {
          pairings.push({
            job_id: job.id,
            cropped_face_id: faceIds[i],
            talent_id: talentIds[i],
            talent_image_id: talentIds[i], // Using talent_id as placeholder
            digital_talent_id: talentIds[i]
          });
        }
      } else {
        // Cross-product for all other modes
        for (const faceId of faceIds) {
          for (const talentId of talentIds) {
            pairings.push({
              job_id: job.id,
              cropped_face_id: faceId,
              talent_id: talentId,
              talent_image_id: talentId, // Using talent_id as placeholder
              digital_talent_id: talentId
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
                          {face.crop ? (
                            <CroppedFacePreview 
                              imageUrl={face.stored_url || face.source_url}
                              crop={face.crop}
                            />
                          ) : (
                            <img
                              src={face.stored_url || face.source_url}
                              alt=""
                              className="w-full aspect-square object-cover"
                            />
                          )}
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
                <ScrollArea className="h-[450px]">
                  {digitalTalents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No digital talents found. Create them in the Digital Talent app.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
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
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
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
                  disabled={isLoading || selectedFaceIds.size === 0 || selectedTalentIds.size === 0}
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
  const [outputs, setOutputs] = useState<Record<string, any[]>>({});
  const [job, setJob] = useState<FacePairingJob | null>(null);
  const [groupBy, setGroupBy] = useState<'talent' | 'identity'>('talent');

  useEffect(() => {
    if (jobId) {
      loadJobData();
    }
  }, [jobId]);

  useEffect(() => {
    if (!job || ['completed', 'failed'].includes(job.status)) return;

    const interval = setInterval(() => {
      loadJobData();
    }, 3000);

    return () => clearInterval(interval);
  }, [job]);

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

    // Load pairings with related data
    const { data: pairingsData } = await supabase
      .from('face_pairings')
      .select(`
        *,
        face_scrape_images!cropped_face_id (
          id,
          stored_url,
          source_url,
          face_identity_images (
            face_identities (
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

      // Load outputs for each pairing
      const outputsMap: Record<string, any[]> = {};
      for (const pairing of pairingsData) {
        const { data: outputData } = await supabase
          .from('face_pairing_outputs')
          .select('*')
          .eq('pairing_id', pairing.id);

        if (outputData) {
          outputsMap[pairing.id] = outputData;
        }
      }
      setOutputs(outputsMap);
    }
  };

  if (!jobId) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p>No generation job selected. Start a new generation to see results here.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job Status */}
      {job && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{job.name}</h3>
              <p className="text-sm text-muted-foreground capitalize">
                Status: {job.status} • {job.progress}/{job.total_pairings} pairings
              </p>
            </div>
            {job.status === 'describing' && (
              <Button onClick={onStartGeneration}>
                <Play className="h-4 w-4 mr-2" />
                Start Image Generation
              </Button>
            )}
          </div>
          {!['completed', 'failed'].includes(job.status) && (
            <Progress 
              className="mt-3"
              value={job.total_pairings > 0 ? (job.progress / job.total_pairings) * 100 : 0} 
            />
          )}
        </Card>
      )}

      {/* Group By Toggle */}
      <div className="flex gap-2">
        <Button 
          variant={groupBy === 'talent' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setGroupBy('talent')}
        >
          Group by Talent
        </Button>
        <Button 
          variant={groupBy === 'identity' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setGroupBy('identity')}
        >
          Group by Identity
        </Button>
      </div>

      {/* Pairings Grid */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {pairings.map(pairing => {
            const pairingOutputs = outputs[pairing.id] || [];
            const sourceImage = pairing.face_scrape_images;
            const talent = pairing.digital_talents;
            const identityName = sourceImage?.face_identity_images?.[0]?.face_identities?.name || 'Unknown';

            return (
              <Card key={pairing.id} className="p-4">
                <div className="grid grid-cols-6 gap-4">
                  {/* Source Image */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Source</p>
                    <div className="aspect-[3/4] rounded-md overflow-hidden bg-muted">
                      {sourceImage && (
                        <img 
                          src={sourceImage.stored_url || sourceImage.source_url} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <p className="text-xs truncate">{identityName}</p>
                  </div>

                  {/* Digital Talent */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Digital Talent</p>
                    <div className="aspect-square rounded-md overflow-hidden bg-muted">
                      {talent?.front_face_url ? (
                        <img 
                          src={talent.front_face_url} 
                          alt={talent.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-xs truncate">{talent?.name || 'Unknown'}</p>
                  </div>

                  {/* Outfit Description */}
                  <div className="col-span-2 space-y-1">
                    <p className="text-xs text-muted-foreground">Outfit Description</p>
                    <p className="text-xs bg-muted p-2 rounded-md h-20 overflow-y-auto">
                      {pairing.outfit_description || 'Pending...'}
                    </p>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {pairing.outfit_description_status}
                    </Badge>
                  </div>

                  {/* Outputs */}
                  <div className="col-span-2 space-y-1">
                    <p className="text-xs text-muted-foreground">Outputs ({pairingOutputs.length})</p>
                    <div className="grid grid-cols-2 gap-2">
                      {pairingOutputs.map(output => (
                        <div key={output.id} className="aspect-[3/4] rounded-md overflow-hidden bg-muted">
                          {output.stored_url ? (
                            <img 
                              src={output.stored_url} 
                              alt="" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// Component to show CSS-based cropped face preview
function CroppedFacePreview({ 
  imageUrl, 
  crop 
}: { 
  imageUrl: string; 
  crop: { crop_x: number; crop_y: number; crop_width: number; crop_height: number; aspect_ratio: string };
}) {
  // Crop values are stored as percentages (0-100)
  const scale = 100 / crop.crop_width;
  
  return (
    <div className="w-full aspect-square overflow-hidden relative">
      <img
        src={imageUrl}
        alt=""
        className="absolute"
        style={{
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          left: `${-crop.crop_x * scale}%`,
          top: `${-crop.crop_y * scale}%`,
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
