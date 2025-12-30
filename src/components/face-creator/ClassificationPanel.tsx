import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Play, 
  Users, 
  User, 
  RotateCcw,
  Eye,
  ChevronRight,
  X
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ClassificationPanelProps {
  runId: string | null;
}

interface Identity {
  id: string;
  name: string;
  gender: string;
  image_count: number;
  representative_image_id: string | null;
}

interface IdentityImage {
  id: string;
  identity_id: string;
  scrape_image_id: string;
  view: string | null;
  view_source: string | null;
  is_ignored: boolean | null;
  scrape_image: {
    id: string;
    stored_url: string | null;
    source_url: string;
    gender: string | null;
  } | null;
}

type ViewType = 'front' | 'side' | 'back' | 'unknown';

export function ClassificationPanel({ runId }: ClassificationPanelProps) {
  const { toast } = useToast();
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'men' | 'women'>('women');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [identityImages, setIdentityImages] = useState<IdentityImage[]>([]);
  const [viewFilter, setViewFilter] = useState<ViewType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ progress: number; total: number; status: string } | null>(null);

  // Fetch identities when runId or gender changes
  useEffect(() => {
    if (!runId) {
      setIdentities([]);
      return;
    }

    async function fetchIdentities() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('face_identities')
        .select('*')
        .eq('scrape_run_id', runId)
        .eq('gender', selectedGender)
        .order('image_count', { ascending: false });

      if (error) {
        console.error('Error fetching identities:', error);
      } else {
        setIdentities(data || []);
        if (data && data.length > 0 && !selectedIdentity) {
          setSelectedIdentity(data[0].id);
        }
      }
      setIsLoading(false);
    }

    fetchIdentities();
  }, [runId, selectedGender]);

  // Fetch identity images when selected identity changes
  useEffect(() => {
    if (!selectedIdentity) {
      setIdentityImages([]);
      return;
    }

    async function fetchIdentityImages() {
      const { data, error } = await supabase
        .from('face_identity_images')
        .select(`
          *,
          scrape_image:face_scrape_images(id, stored_url, source_url, gender)
        `)
        .eq('identity_id', selectedIdentity)
        .eq('is_ignored', false);

      if (error) {
        console.error('Error fetching identity images:', error);
      } else {
        setIdentityImages(data || []);
      }
    }

    fetchIdentityImages();
  }, [selectedIdentity]);

  // Subscribe to job progress
  useEffect(() => {
    if (!runId) return;

    const channel = supabase
      .channel('face-job-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'face_jobs',
          filter: `scrape_run_id=eq.${runId}`,
        },
        (payload) => {
          const job = payload.new as any;
          if (job.status === 'running') {
            setJobProgress({
              progress: job.progress || 0,
              total: job.total || 0,
              status: job.type,
            });
          } else if (job.status === 'completed' || job.status === 'failed') {
            setJobProgress(null);
            setIsRunningAI(false);
            // Refresh data
            if (job.status === 'completed') {
              toast({ title: "AI classification completed" });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, toast]);

  const handleRunAllAI = async () => {
    if (!runId) {
      toast({ title: "No scrape run selected", variant: "destructive" });
      return;
    }

    setIsRunningAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('classify-all', {
        body: { runId },
      });

      if (error) throw error;

      toast({ title: "AI classification started", description: "This may take a few minutes" });
    } catch (error) {
      console.error('Error running AI classification:', error);
      toast({ title: "Failed to start AI classification", variant: "destructive" });
      setIsRunningAI(false);
    }
  };

  const handleViewChange = async (imageId: string, newView: ViewType) => {
    const { error } = await supabase
      .from('face_identity_images')
      .update({ view: newView, view_source: 'manual' })
      .eq('id', imageId);

    if (error) {
      toast({ title: "Failed to update view", variant: "destructive" });
    } else {
      setIdentityImages(prev =>
        prev.map(img => img.id === imageId ? { ...img, view: newView, view_source: 'manual' } : img)
      );
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    const { error } = await supabase
      .from('face_identity_images')
      .update({ is_ignored: true })
      .eq('id', imageId);

    if (error) {
      toast({ title: "Failed to remove image", variant: "destructive" });
    } else {
      setIdentityImages(prev => prev.filter(img => img.id !== imageId));
      // Update count in identities
      setIdentities(prev =>
        prev.map(id => id.id === selectedIdentity ? { ...id, image_count: id.image_count - 1 } : id)
      );
    }
  };

  const filteredImages = viewFilter === 'all' 
    ? identityImages 
    : identityImages.filter(img => img.view === viewFilter);

  const selectedIdentityData = identities.find(id => id.id === selectedIdentity);

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab first
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Sidebar */}
      <div className="space-y-4">
        {/* Run All AI Button */}
        <Button
          onClick={handleRunAllAI}
          disabled={isRunningAI}
          className="w-full"
          size="lg"
        >
          {isRunningAI ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Running AI...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run All AI Jobs
            </>
          )}
        </Button>

        {jobProgress && (
          <Card className="bg-muted/50">
            <CardContent className="py-3">
              <p className="text-sm font-medium capitalize">{jobProgress.status.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground">
                {jobProgress.progress} / {jobProgress.total}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Gender Toggle */}
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Gender</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex gap-2">
              <Button
                variant={selectedGender === 'women' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedGender('women');
                  setSelectedIdentity(null);
                }}
                className="flex-1"
              >
                <User className="h-4 w-4 mr-1" />
                Women
              </Button>
              <Button
                variant={selectedGender === 'men' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedGender('men');
                  setSelectedIdentity(null);
                }}
                className="flex-1"
              >
                <User className="h-4 w-4 mr-1" />
                Men
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Models List */}
        <Card className="flex-1">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Models ({identities.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : identities.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  No models found. Run AI classification first.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {identities.map(identity => (
                    <button
                      key={identity.id}
                      onClick={() => setSelectedIdentity(identity.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-muted/50 flex items-center justify-between ${
                        selectedIdentity === identity.id ? 'bg-muted' : ''
                      }`}
                    >
                      <span className="font-medium">{identity.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{identity.image_count}</Badge>
                        {selectedIdentity === identity.id && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Image Grid */}
      <div className="lg:col-span-3">
        <Card className="h-full">
          <CardHeader className="py-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {selectedIdentityData?.name || 'Select a model'}
              </CardTitle>
              {selectedIdentityData && (
                <p className="text-sm text-muted-foreground">
                  {filteredImages.length} images
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewFilter} onValueChange={(v) => setViewFilter(v as any)}>
                <SelectTrigger className="w-32">
                  <Eye className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All views" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Views</SelectItem>
                  <SelectItem value="front">Front</SelectItem>
                  <SelectItem value="side">Side</SelectItem>
                  <SelectItem value="back">Back</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedIdentity ? (
              <div className="py-12 text-center text-muted-foreground">
                Select a model from the sidebar to view their images
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No images found for this filter
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredImages.map(image => (
                  <div 
                    key={image.id} 
                    className="relative group rounded-lg overflow-hidden border border-border bg-muted/30"
                  >
                    <img
                      src={image.scrape_image?.stored_url || image.scrape_image?.source_url || ''}
                      alt=""
                      className="w-full aspect-[3/4] object-cover"
                      loading="lazy"
                    />
                    
                    {/* View Badge */}
                    <div className="absolute bottom-2 left-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="secondary"
                            className="h-7 text-xs capitalize"
                          >
                            {image.view || 'unknown'}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleViewChange(image.id, 'front')}>
                            Front
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewChange(image.id, 'side')}>
                            Side
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewChange(image.id, 'back')}>
                            Back
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewChange(image.id, 'unknown')}>
                            Unknown
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Remove Button */}
                    <button
                      onClick={() => handleRemoveImage(image.id)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
