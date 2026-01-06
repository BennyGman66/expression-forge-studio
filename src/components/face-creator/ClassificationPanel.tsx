import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Play, 
  Users, 
  User, 
  Eye,
  ChevronRight,
  X,
  HelpCircle,
  ArrowRight,
  Download,
  Link,
  Unlink,
  Trash2,
  Plus,
  Maximize2
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PromoteToTwinDialog } from "@/components/shared/PromoteToTwinDialog";

interface ClassificationPanelProps {
  runId: string | null;
}

interface DigitalTalent {
  id: string;
  name: string;
  gender: string | null;
  front_face_url: string | null;
}

interface Identity {
  id: string;
  name: string;
  gender: string;
  image_count: number;
  representative_image_id: string | null;
  representative_image_url?: string | null;
  talent_id?: string | null;
  digital_talent?: DigitalTalent | null;
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

interface UnclassifiedImage {
  id: string;
  stored_url: string | null;
  source_url: string;
  gender: string | null;
}

type ViewType = 'front' | 'side' | 'back' | 'unknown';
type GenderFilter = 'all' | 'men' | 'women';

export function ClassificationPanel({ runId }: ClassificationPanelProps) {
  const { toast } = useToast();
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [selectedGender, setSelectedGender] = useState<GenderFilter>('all');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [identityImages, setIdentityImages] = useState<IdentityImage[]>([]);
  const [viewFilter, setViewFilter] = useState<ViewType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [jobProgress, setJobProgress] = useState<{ progress: number; total: number; status: string } | null>(null);
  
  // Unclassified state
  const [unclassifiedImages, setUnclassifiedImages] = useState<UnclassifiedImage[]>([]);
  const [showUnclassified, setShowUnclassified] = useState(false);
  
  // Move image dialog
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedImageToMove, setSelectedImageToMove] = useState<UnclassifiedImage | null>(null);
  
  // Digital talents for linking
  const [linkTalentDialogOpen, setLinkTalentDialogOpen] = useState(false);
  const [selectedIdentityForLink, setSelectedIdentityForLink] = useState<Identity | null>(null);
  const [digitalTalents, setDigitalTalents] = useState<DigitalTalent[]>([]);
  const [talentsLoading, setTalentsLoading] = useState(false);

  // Promote to twin dialog
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [selectedIdentityForPromote, setSelectedIdentityForPromote] = useState<Identity | null>(null);

  // Image preview dialog
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewIdentity, setPreviewIdentity] = useState<Identity | null>(null);
  const [previewImages, setPreviewImages] = useState<IdentityImage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch identities with thumbnails when runId or gender changes
  useEffect(() => {
    if (!runId) {
      setIdentities([]);
      return;
    }

    async function fetchIdentities() {
      setIsLoading(true);
      
      // First fetch identities with representative images
      let query = supabase
        .from('face_identities')
        .select(`
          *,
          representative_image:face_scrape_images!face_identities_representative_image_id_fkey(stored_url, source_url)
        `)
        .eq('scrape_run_id', runId)
        .order('image_count', { ascending: false });

      if (selectedGender !== 'all') {
        query = query.eq('gender', selectedGender);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching identities:', error);
        setIsLoading(false);
        return;
      }

      // Get talent_ids that are set and fetch corresponding digital talents
      const talentIds = (data || [])
        .map((identity: any) => identity.talent_id)
        .filter((id: string | null) => id !== null);

      let digitalTalentsMap: Record<string, any> = {};
      
      if (talentIds.length > 0) {
        const { data: talentData } = await supabase
          .from('digital_talents')
          .select('id, name, gender, front_face_url')
          .in('id', talentIds);
        
        if (talentData) {
          digitalTalentsMap = talentData.reduce((acc: Record<string, any>, talent: any) => {
            acc[talent.id] = talent;
            return acc;
          }, {});
        }
      }

      const identitiesWithUrls = (data || []).map((identity: any) => ({
        ...identity,
        representative_image_url: identity.representative_image?.stored_url || identity.representative_image?.source_url || null,
        digital_talent: identity.talent_id ? digitalTalentsMap[identity.talent_id] || null : null,
      }));
      
      setIdentities(identitiesWithUrls);
      if (identitiesWithUrls.length > 0 && !selectedIdentity && !showUnclassified) {
        setSelectedIdentity(identitiesWithUrls[0].id);
      }
      
      setIsLoading(false);
    }

    fetchIdentities();
  }, [runId, selectedGender]);

  // Fetch digital talents for linking
  useEffect(() => {
    async function fetchDigitalTalents() {
      setTalentsLoading(true);
      const { data, error } = await supabase
        .from('digital_talents')
        .select('id, name, gender, front_face_url')
        .order('name');

      if (error) {
        console.error('Error fetching digital talents:', error);
      } else {
        setDigitalTalents(data || []);
      }
      setTalentsLoading(false);
    }

    fetchDigitalTalents();
  }, []);

  // Fetch unclassified images
  useEffect(() => {
    if (!runId) {
      setUnclassifiedImages([]);
      return;
    }

    async function fetchUnclassified() {
      // Get all scrape images for this run
      const { data: allImages } = await supabase
        .from('face_scrape_images')
        .select('id, stored_url, source_url, gender')
        .eq('scrape_run_id', runId);

      // Get all classified image IDs
      const { data: classifiedLinks } = await supabase
        .from('face_identity_images')
        .select('scrape_image_id')
        .eq('is_ignored', false);

      const classifiedIds = new Set((classifiedLinks || []).map(l => l.scrape_image_id));
      
      // Filter to unclassified
      const unclassified = (allImages || []).filter(img => !classifiedIds.has(img.id));
      setUnclassifiedImages(unclassified);
    }

    fetchUnclassified();
  }, [runId, identities]);

  // Fetch identity images when selected identity changes
  useEffect(() => {
    if (!selectedIdentity || showUnclassified) {
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
  }, [selectedIdentity, showUnclassified]);

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
      setIdentities(prev =>
        prev.map(id => id.id === selectedIdentity ? { ...id, image_count: id.image_count - 1 } : id)
      );
    }
  };

  const handleMoveToModel = async (targetIdentityId: string) => {
    if (!selectedImageToMove) return;

    // Create a new face_identity_images record
    const { error } = await supabase
      .from('face_identity_images')
      .insert({
        identity_id: targetIdentityId,
        scrape_image_id: selectedImageToMove.id,
        view: 'unknown',
        view_source: 'manual',
      });

    if (error) {
      toast({ title: "Failed to move image", variant: "destructive" });
    } else {
      // Get current identity to update count
      const targetIdentity = identities.find(id => id.id === targetIdentityId);
      if (targetIdentity) {
        await supabase
          .from('face_identities')
          .update({ image_count: targetIdentity.image_count + 1 })
          .eq('id', targetIdentityId);
      }

      // Remove from unclassified
      setUnclassifiedImages(prev => prev.filter(img => img.id !== selectedImageToMove.id));
      
      // Update identity count in local state
      setIdentities(prev =>
        prev.map(id => id.id === targetIdentityId ? { ...id, image_count: id.image_count + 1 } : id)
      );

      toast({ title: "Image moved successfully" });
    }

    setMoveDialogOpen(false);
    setSelectedImageToMove(null);
  };

  const handleSelectUnclassified = () => {
    setShowUnclassified(true);
    setSelectedIdentity(null);
  };

  const handleSelectIdentity = (identityId: string) => {
    setShowUnclassified(false);
    setSelectedIdentity(identityId);
  };

  const handleOpenLinkDialog = (e: React.MouseEvent, identity: Identity) => {
    e.stopPropagation();
    setSelectedIdentityForLink(identity);
    setLinkTalentDialogOpen(true);
  };

  const handleLinkTalent = async (talentId: string) => {
    if (!selectedIdentityForLink) return;

    const { error } = await supabase
      .from('face_identities')
      .update({ talent_id: talentId } as any)
      .eq('id', selectedIdentityForLink.id);

    if (error) {
      toast({ title: "Failed to link digital talent", variant: "destructive" });
    } else {
      const linkedTalent = digitalTalents.find(t => t.id === talentId);
      setIdentities(prev =>
        prev.map(id => id.id === selectedIdentityForLink.id 
          ? { ...id, talent_id: talentId, digital_talent: linkedTalent || null } 
          : id
        )
      );
      toast({ title: "Digital talent linked successfully" });
    }

    setLinkTalentDialogOpen(false);
    setSelectedIdentityForLink(null);
  };

  const handleUnlinkTalent = async (e: React.MouseEvent, identity: Identity) => {
    e.stopPropagation();

    const { error } = await supabase
      .from('face_identities')
      .update({ talent_id: null } as any)
      .eq('id', identity.id);

    if (error) {
      toast({ title: "Failed to unlink digital talent", variant: "destructive" });
    } else {
      setIdentities(prev =>
        prev.map(id => id.id === identity.id 
          ? { ...id, talent_id: null, digital_talent: null } 
          : id
        )
      );
      toast({ title: "Digital talent unlinked" });
    }
  };

  const handleDeleteModel = async (e: React.MouseEvent, identity: Identity) => {
    e.stopPropagation();
    
    if (!confirm(`Delete ${identity.name}? This will also remove all associated images from the scrape.`)) {
      return;
    }

    try {
      // Get all scrape_image_ids linked to this identity
      const { data: imageLinks } = await supabase
        .from('face_identity_images')
        .select('scrape_image_id')
        .eq('identity_id', identity.id);

      const scrapeImageIds = (imageLinks || []).map(link => link.scrape_image_id);

      // Delete the identity (cascades to face_identity_images)
      const { error: deleteIdentityError } = await supabase
        .from('face_identities')
        .delete()
        .eq('id', identity.id);

      if (deleteIdentityError) throw deleteIdentityError;

      // Delete the actual scrape images
      if (scrapeImageIds.length > 0) {
        const { error: deleteImagesError } = await supabase
          .from('face_scrape_images')
          .delete()
          .in('id', scrapeImageIds);

        if (deleteImagesError) {
          console.error('Error deleting scrape images:', deleteImagesError);
        }
      }

      // Update local state
      setIdentities(prev => prev.filter(id => id.id !== identity.id));
      if (selectedIdentity === identity.id) {
        setSelectedIdentity(null);
      }

      toast({ title: `${identity.name} deleted`, description: `${scrapeImageIds.length} images removed` });
    } catch (error) {
      console.error('Error deleting model:', error);
      toast({ title: "Failed to delete model", variant: "destructive" });
    }
  };

  const handleDeleteUnclassifiedImage = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    
    const { error } = await supabase
      .from('face_scrape_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      toast({ title: "Failed to delete image", variant: "destructive" });
    } else {
      setUnclassifiedImages(prev => prev.filter(img => img.id !== imageId));
      toast({ title: "Image deleted" });
    }
  };

  const handleDeleteAllUnclassified = async () => {
    if (!confirm(`Delete all ${unclassifiedImages.length} unclassified images? This cannot be undone.`)) {
      return;
    }

    const imageIds = unclassifiedImages.map(img => img.id);
    
    const { error } = await supabase
      .from('face_scrape_images')
      .delete()
      .in('id', imageIds);

    if (error) {
      toast({ title: "Failed to delete images", variant: "destructive" });
    } else {
      setUnclassifiedImages([]);
      setShowUnclassified(false);
      toast({ title: "All unclassified images deleted", description: `${imageIds.length} images removed` });
    }
  };

  const handleDownloadImage = async (e: React.MouseEvent, imageUrl: string) => {
    e.stopPropagation();
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Failed to download image", variant: "destructive" });
    }
  };

  const handleOpenPreview = async (e: React.MouseEvent, identity: Identity) => {
    e.stopPropagation();
    setPreviewIdentity(identity);
    setPreviewDialogOpen(true);
    setPreviewLoading(true);

    const { data, error } = await supabase
      .from('face_identity_images')
      .select(`
        *,
        scrape_image:face_scrape_images(id, stored_url, source_url, gender)
      `)
      .eq('identity_id', identity.id)
      .eq('is_ignored', false);

    if (!error && data) {
      setPreviewImages(data as IdentityImage[]);
    }
    setPreviewLoading(false);
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

  // Pre-filter handler
  const handlePreFilter = async () => {
    if (!runId) return;

    try {
      setIsRunningAI(true);
      const { data, error } = await supabase.functions.invoke('organize-face-images', {
        body: { scrapeRunId: runId },
      });

      if (error) throw error;
      toast({ title: "Pre-filter started", description: "Removing kids, shoes, and junk images..." });
    } catch (error) {
      console.error('Error running pre-filter:', error);
      toast({ title: "Failed to start pre-filter", variant: "destructive" });
      setIsRunningAI(false);
    }
  };

  // Reset classification handler
  const handleResetClassification = async () => {
    if (!runId) return;
    if (!confirm('This will delete all model groupings and start fresh. Continue?')) return;

    try {
      setIsLoading(true);

      // Delete identity images first (foreign key)
      for (const identity of identities) {
        await supabase
          .from('face_identity_images')
          .delete()
          .eq('identity_id', identity.id);
      }

      // Delete identities
      await supabase
        .from('face_identities')
        .delete()
        .eq('scrape_run_id', runId);

      setIdentities([]);
      setSelectedIdentity(null);
      toast({ title: "Classification reset complete" });
    } catch (error) {
      console.error('Error resetting classification:', error);
      toast({ title: "Failed to reset classification", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Left Sidebar */}
      <div className="space-y-4">
        {/* Workflow Guidance */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">Workflow:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Pre-filter (removes kids, shoes, junk)</li>
              <li>Classify Models (groups faces)</li>
            </ol>
          </CardContent>
        </Card>

        {/* Pre-filter Button */}
        <Button
          onClick={handlePreFilter}
          disabled={isRunningAI}
          variant="outline"
          className="w-full"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Pre-filter Junk Images
        </Button>

        {/* Classify Models Button */}
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
              Classify Models
            </>
          )}
        </Button>

        {/* Reset Button */}
        {identities.length > 0 && (
          <Button
            onClick={handleResetClassification}
            disabled={isLoading || isRunningAI}
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4 mr-2" />
            Reset Classification
          </Button>
        )}

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

        {/* Gender Filter */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Gender</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedGender === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedGender('all');
                  setSelectedIdentity(null);
                  setShowUnclassified(false);
                }}
              >
                <Users className="h-4 w-4 mr-1" />
                All
              </Button>
              <Button
                variant={selectedGender === 'women' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedGender('women');
                  setSelectedIdentity(null);
                  setShowUnclassified(false);
                }}
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
                  setShowUnclassified(false);
                }}
              >
                <User className="h-4 w-4 mr-1" />
                Men
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Models List */}
        <Card className="flex-1">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Models ({identities.length})
              </p>
            </div>
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {/* Unclassified Category */}
                  {unclassifiedImages.length > 0 && (
                    <button
                      onClick={handleSelectUnclassified}
                      className={`w-full px-4 py-3 text-left hover:bg-muted/50 flex items-center justify-between ${
                        showUnclassified ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-amber-500/20 text-amber-600">
                            <HelpCircle className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-amber-600">Unclassified</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">
                          {unclassifiedImages.length}
                        </Badge>
                        {showUnclassified && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  )}

                  {/* Model List */}
                  {identities.length === 0 && unclassifiedImages.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No models found. Run AI classification first.
                    </div>
                  ) : (
                    identities.map(identity => (
                      <div
                        key={identity.id}
                        onClick={() => handleSelectIdentity(identity.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-muted/50 cursor-pointer group ${
                          selectedIdentity === identity.id && !showUnclassified ? 'bg-muted' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 flex-shrink-0">
                            {identity.representative_image_url ? (
                              <AvatarImage 
                                src={identity.representative_image_url} 
                                alt={identity.name}
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{identity.name}</span>
                              {identity.digital_talent && (
                                <Badge variant="outline" className="text-[10px] px-1.5 flex-shrink-0">
                                  {identity.digital_talent.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {identity.digital_talent ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-60 hover:opacity-100"
                                onClick={(e) => handleUnlinkTalent(e, identity)}
                                title="Unlink talent"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-60 hover:opacity-100"
                                onClick={(e) => handleOpenLinkDialog(e, identity)}
                                title="Link to talent"
                              >
                                <Link className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-60 hover:opacity-100"
                              onClick={(e) => handleOpenPreview(e, identity)}
                              title="Preview all images"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </Button>
                            <Badge variant="secondary" className="min-w-[28px] justify-center">
                              {identity.image_count}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIdentityForPromote(identity);
                                setPromoteDialogOpen(true);
                              }}
                              title="Promote to Digital Twin"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => handleDeleteModel(e, identity)}
                              title="Delete model and images"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {selectedIdentity === identity.id && !showUnclassified && (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
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
                {showUnclassified ? 'Unclassified Images' : selectedIdentityData?.name || 'Select a model'}
              </CardTitle>
              {(showUnclassified || selectedIdentityData) && (
                <p className="text-sm text-muted-foreground">
                  {showUnclassified ? unclassifiedImages.length : filteredImages.length} images
                </p>
              )}
            </div>
            {showUnclassified ? (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleDeleteAllUnclassified}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </Button>
            ) : (
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
            )}
          </CardHeader>
          <CardContent>
            {showUnclassified ? (
              // Unclassified Images Grid
              unclassifiedImages.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No unclassified images
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {unclassifiedImages.map(image => {
                    const imageUrl = image.stored_url || image.source_url;
                    return (
                      <div 
                        key={image.id} 
                        className="relative group rounded-lg overflow-hidden border border-border bg-muted/30 cursor-pointer"
                        onClick={() => {
                          setSelectedImageToMove(image);
                          setMoveDialogOpen(true);
                        }}
                      >
                        <img
                          src={imageUrl}
                          alt=""
                          className="w-full aspect-[3/4] object-cover"
                          loading="lazy"
                        />
                        
                        {/* Download button */}
                        <button
                          onClick={(e) => handleDownloadImage(e, imageUrl)}
                          className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-full p-1.5 hover:bg-background"
                          title="Download image"
                        >
                          <Download className="h-4 w-4" />
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteUnclassifiedImage(e, image.id)}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1.5 hover:bg-destructive/90"
                          title="Delete image"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        
                        {/* Move indicator */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <div className="bg-background/90 rounded-full p-2">
                            <ArrowRight className="h-5 w-5 text-foreground" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : !selectedIdentity ? (
              <div className="py-12 text-center text-muted-foreground">
                Select a model from the sidebar to view their images
              </div>
            ) : filteredImages.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No images found for this filter
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredImages.map(image => {
                  const imageUrl = image.scrape_image?.stored_url || image.scrape_image?.source_url || '';
                  return (
                    <div 
                      key={image.id} 
                      className="relative group rounded-lg overflow-hidden border border-border bg-muted/30"
                    >
                      <img
                        src={imageUrl}
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

                      {/* Download Button */}
                      <button
                        onClick={(e) => handleDownloadImage(e, imageUrl)}
                        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-full p-1.5 hover:bg-background"
                        title="Download image"
                      >
                        <Download className="h-4 w-4" />
                      </button>

                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveImage(image.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Move Image Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Model</DialogTitle>
            <DialogDescription>
              Select which model to assign this image to.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <div className="space-y-2">
              {identities.map(identity => (
                <button
                  key={identity.id}
                  onClick={() => handleMoveToModel(identity.id)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/50 rounded-lg flex items-center justify-between border border-border"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {identity.representative_image_url ? (
                        <AvatarImage 
                          src={identity.representative_image_url} 
                          alt={identity.name}
                          className="object-cover"
                        />
                      ) : null}
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{identity.name}</span>
                  </div>
                  <Badge variant="secondary">{identity.image_count}</Badge>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link Talent Dialog */}
      <Dialog open={linkTalentDialogOpen} onOpenChange={setLinkTalentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Digital Talent</DialogTitle>
            <DialogDescription>
              Select a digital talent to link with "{selectedIdentityForLink?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {talentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : digitalTalents.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No digital talents found. Create them in the Digital Talent hub first.
              </div>
            ) : (
              <div className="space-y-2">
                {digitalTalents.map(talent => (
                  <button
                    key={talent.id}
                    onClick={() => handleLinkTalent(talent.id)}
                    className="w-full px-4 py-3 text-left hover:bg-muted/50 rounded-lg flex items-center justify-between border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {talent.front_face_url ? (
                          <AvatarImage src={talent.front_face_url} alt={talent.name} className="object-cover" />
                        ) : null}
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{talent.name}</span>
                        {talent.gender && (
                          <span className="text-xs text-muted-foreground capitalize">{talent.gender}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Promote to Twin Dialog */}
      {selectedIdentityForPromote && (
        <PromoteToTwinDialog
          open={promoteDialogOpen}
          onOpenChange={setPromoteDialogOpen}
          identityId={selectedIdentityForPromote.id}
          defaultName={selectedIdentityForPromote.name}
          defaultGender={selectedIdentityForPromote.gender}
          representativeImageUrl={selectedIdentityForPromote.representative_image_url}
          onSuccess={(twinId, twinName) => {
            // Update identity in list with linked twin info and new name
            setIdentities(prev => prev.map(id => 
              id.id === selectedIdentityForPromote.id 
                ? { ...id, name: twinName, linked_twin_id: twinId }
                : id
            ));
            setSelectedIdentityForPromote(null);
          }}
        />
      )}

      {/* Image Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {previewIdentity?.representative_image_url && (
                <Avatar className="h-10 w-10">
                  <AvatarImage src={previewIdentity.representative_image_url} className="object-cover" />
                  <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                </Avatar>
              )}
              {previewIdentity?.name}
              <Badge variant="secondary">{previewImages.length} images</Badge>
            </DialogTitle>
            <DialogDescription>
              All images for this model identity
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh]">
            {previewLoading ? (
              <div className="grid grid-cols-4 gap-4 p-4">
                {[1,2,3,4,5,6,7,8].map(i => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4 p-4">
                {previewImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.scrape_image?.stored_url || img.scrape_image?.source_url}
                      alt="Model image"
                      className="w-full aspect-[3/4] object-cover rounded-lg"
                    />
                    <Badge 
                      variant="secondary" 
                      className="absolute bottom-2 left-2 text-xs capitalize"
                    >
                      {img.view || 'unknown'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
