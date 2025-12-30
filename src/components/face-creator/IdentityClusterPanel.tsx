import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Loader2, Play, RefreshCw, Users, Merge, Split, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { FaceIdentity, FaceScrapeImage, FaceJob } from "@/types/face-creator";

interface IdentityClusterPanelProps {
  runId: string | null;
}

interface IdentityWithImages extends FaceIdentity {
  images: FaceScrapeImage[];
}

export function IdentityClusterPanel({ runId }: IdentityClusterPanelProps) {
  const { toast } = useToast();
  const [identities, setIdentities] = useState<IdentityWithImages[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clustering, setClustering] = useState(false);
  const [strictness, setStrictness] = useState([0.7]);
  const [job, setJob] = useState<FaceJob | null>(null);
  const [genderFilter, setGenderFilter] = useState<'all' | 'men' | 'women'>('all');

  useEffect(() => {
    if (runId) {
      fetchIdentities();
      fetchJob();

      const channel = supabase
        .channel('identity-cluster')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_jobs', filter: `scrape_run_id=eq.${runId}` },
          () => fetchJob()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'face_identities', filter: `scrape_run_id=eq.${runId}` },
          () => fetchIdentities()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [runId]);

  const fetchIdentities = async () => {
    if (!runId) return;
    setLoading(true);
    
    // Fetch identities
    const { data: identitiesData, error } = await supabase
      .from('face_identities')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching identities:', error);
      setLoading(false);
      return;
    }

    // For each identity, fetch associated images
    const identitiesWithImages: IdentityWithImages[] = [];
    
    for (const identity of identitiesData) {
      const { data: links } = await supabase
        .from('face_identity_images')
        .select('scrape_image_id')
        .eq('identity_id', identity.id)
        .eq('is_ignored', false);

      if (links && links.length > 0) {
        const imageIds = links.map(l => l.scrape_image_id);
        const { data: images } = await supabase
          .from('face_scrape_images')
          .select('*')
          .in('id', imageIds);

        identitiesWithImages.push({
          ...(identity as unknown as FaceIdentity),
          images: (images || []) as unknown as FaceScrapeImage[],
        });
      } else {
        identitiesWithImages.push({
          ...(identity as unknown as FaceIdentity),
          images: [],
        });
      }
    }

    setIdentities(identitiesWithImages);
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'clustering')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      setClustering(data.status === 'running');
    }
  };

  const handleRunClustering = async () => {
    if (!runId) return;
    setClustering(true);
    
    try {
      const { error } = await supabase.functions.invoke('cluster-identities', {
        body: { runId, threshold: strictness[0] },
      });

      if (error) throw error;
      toast({ title: "Started", description: "Identity clustering started" });
    } catch (error) {
      console.error('Error starting clustering:', error);
      toast({ title: "Error", description: "Failed to start clustering", variant: "destructive" });
      setClustering(false);
    }
  };

  const handleRemoveFromIdentity = async (identityId: string, imageId: string) => {
    try {
      const { error } = await supabase
        .from('face_identity_images')
        .update({ is_ignored: true })
        .eq('identity_id', identityId)
        .eq('scrape_image_id', imageId);

      if (error) throw error;
      fetchIdentities();
      toast({ title: "Removed", description: "Image removed from identity" });
    } catch (error) {
      console.error('Error removing image:', error);
      toast({ title: "Error", description: "Failed to remove image", variant: "destructive" });
    }
  };

  const filteredIdentities = genderFilter === 'all' 
    ? identities 
    : identities.filter(i => i.gender === genderFilter);

  const selectedIdentityData = identities.find(i => i.id === selectedIdentity);

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to run identity clustering
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Identity Clustering</h2>
          <Badge variant="outline">{identities.length} identities</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Strictness:</Label>
            <div className="w-32">
              <Slider
                value={strictness}
                onValueChange={setStrictness}
                min={0.5}
                max={0.95}
                step={0.05}
              />
            </div>
            <span className="text-sm text-muted-foreground w-12">{strictness[0].toFixed(2)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchIdentities}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleRunClustering} 
            disabled={clustering}
          >
            {clustering ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clustering...</>
            ) : (
              <><Play className="h-4 w-4 mr-2" /> Run Clustering</>
            )}
          </Button>
        </div>
      </div>

      {/* Progress */}
      {job && job.status === 'running' && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Clustering identities...</span>
                <span>{job.progress} / {job.total}</span>
              </div>
              <Progress value={(job.progress / Math.max(job.total, 1)) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gender filter */}
      <div className="flex gap-2">
        <Button 
          variant={genderFilter === 'all' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setGenderFilter('all')}
        >
          All
        </Button>
        <Button 
          variant={genderFilter === 'men' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setGenderFilter('men')}
        >
          Men
        </Button>
        <Button 
          variant={genderFilter === 'women' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setGenderFilter('women')}
        >
          Women
        </Button>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Identity list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Identities</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filteredIdentities.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No identities yet. Run clustering first.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredIdentities.map((identity) => (
                    <div
                      key={identity.id}
                      onClick={() => setSelectedIdentity(identity.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedIdentity === identity.id 
                          ? 'bg-primary/10 border border-primary' 
                          : 'hover:bg-muted border border-transparent'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                        {identity.images[0] && (
                          <img
                            src={identity.images[0].stored_url || identity.images[0].source_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{identity.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {identity.images.length} images • {identity.gender}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Selected identity images */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              {selectedIdentityData?.name || 'Select an identity'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedIdentityData ? (
              <div className="text-center py-12 text-muted-foreground">
                Select an identity to view images
              </div>
            ) : selectedIdentityData.images.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No images in this identity
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {selectedIdentityData.images.map((image) => (
                  <Card key={image.id} className="overflow-hidden group relative">
                    <div className="aspect-[3/4]">
                      <img
                        src={image.stored_url || image.source_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveFromIdentity(selectedIdentityData.id, image.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
