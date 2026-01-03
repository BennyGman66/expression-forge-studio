import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { JOB_TYPE_CONFIG } from '@/lib/jobTypes';
import { ArtifactType } from '@/types/jobs';

interface CreateFoundationFaceReplaceJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookId: string;
  lookName: string;
  projectId?: string;
}

interface AssetValidation {
  key: ArtifactType;
  label: string;
  view: string;
  exists: boolean;
  url?: string;
  sourceId?: string;
}

interface ViewPairing {
  view: string;
  headRender: AssetValidation | undefined;
  sourceImage: AssetValidation | undefined;
}

export function CreateFoundationFaceReplaceJobDialog({
  open,
  onOpenChange,
  lookId,
  lookName,
  projectId,
}: CreateFoundationFaceReplaceJobDialogProps) {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [assets, setAssets] = useState<AssetValidation[]>([]);
  const [title, setTitle] = useState(`Foundation Face Replace - ${lookName}`);
  const [priority, setPriority] = useState('2');
  const [instructions, setInstructions] = useState(
    JOB_TYPE_CONFIG.FOUNDATION_FACE_REPLACE.defaultInstructions
  );

  // Update title when lookName changes
  useEffect(() => {
    setTitle(`Foundation Face Replace - ${lookName}`);
  }, [lookName]);

  const allAssetsValid = assets.length === 6 && assets.every((a) => a.exists);
  
  // Group assets into view pairings
  const viewPairings: ViewPairing[] = ['front', 'side', 'back'].map(view => ({
    view,
    headRender: assets.find(a => a.key === `HEAD_RENDER_${view.toUpperCase()}`),
    sourceImage: assets.find(a => a.key === `LOOK_ORIGINAL_${view.toUpperCase()}`),
  }));

  useEffect(() => {
    if (open && lookId) {
      validateAssets();
    }
  }, [open, lookId]);

  const validateAssets = async () => {
    if (!lookId) return;
    
    setValidating(true);
    const validations: AssetValidation[] = [];

    try {
      // Get jobs for this look
      const { data: jobs } = await supabase
        .from('face_application_jobs')
        .select('id')
        .eq('look_id', lookId);

      const jobIds = jobs?.map((j) => j.id) || [];

      // Fetch selected outputs for each view (head renders)
      let outputsByView: Record<string, { id: string; url: string }> = {};
      
      if (jobIds.length > 0) {
        const { data: lookOutputs } = await supabase
          .from('face_application_outputs')
          .select('id, view, stored_url, is_selected, job_id')
          .in('job_id', jobIds)
          .eq('is_selected', true);

        lookOutputs?.forEach((o) => {
          if (o.is_selected && o.stored_url) {
            outputsByView[o.view] = { id: o.id, url: o.stored_url };
          }
        });
      }

      // Fetch all source images for this look (front, side, back)
      const { data: lookSources } = await supabase
        .from('look_source_images')
        .select('id, source_url, view')
        .eq('look_id', lookId);

      const sourcesByView: Record<string, { id: string; url: string }> = {};
      lookSources?.forEach((s) => {
        if (s.source_url) {
          sourcesByView[s.view] = { id: s.id, url: s.source_url };
        }
      });

      // Build validations for each view
      const views = ['front', 'side', 'back'];
      for (const view of views) {
        const output = outputsByView[view];
        const source = sourcesByView[view];
        
        // Head render
        validations.push({
          key: `HEAD_RENDER_${view.toUpperCase()}` as ArtifactType,
          label: `Head (${view.charAt(0).toUpperCase() + view.slice(1)})`,
          view,
          exists: !!output,
          url: output?.url,
          sourceId: output?.id,
        });

        // Original source image
        validations.push({
          key: `LOOK_ORIGINAL_${view.toUpperCase()}` as ArtifactType,
          label: `Source (${view.charAt(0).toUpperCase() + view.slice(1)})`,
          view,
          exists: !!source,
          url: source?.url,
          sourceId: source?.id,
        });
      }

      setAssets(validations);
    } catch (error) {
      console.error('Error validating assets:', error);
      toast.error('Failed to validate assets');
    } finally {
      setValidating(false);
    }
  };

  const handleCreate = async () => {
    if (!allAssetsValid) return;

    setLoading(true);
    try {
      // Create the job
      const { data: job, error: jobError } = await supabase
        .from('unified_jobs')
        .insert({
          type: 'FOUNDATION_FACE_REPLACE',
          status: 'OPEN',
          title: title,
          priority: parseInt(priority),
          look_id: lookId,
          project_id: projectId || null,
          instructions: instructions,
        })
        .select()
        .single();

      if (jobError) throw jobError;

      // Create artifacts and link as inputs
      for (const asset of assets) {
        if (!asset.exists || !asset.url) continue;

        const isHeadRender = asset.key.startsWith('HEAD_RENDER');
        
        // Create artifact
        const { data: artifact, error: artifactError } = await supabase
          .from('unified_artifacts')
          .insert({
            type: asset.key,
            file_url: asset.url,
            preview_url: asset.url,
            look_id: lookId,
            project_id: projectId || null,
            source_table: isHeadRender ? 'face_application_outputs' : 'look_source_images',
            source_id: asset.sourceId,
            metadata: { view: asset.view },
          })
          .select()
          .single();

        if (artifactError) throw artifactError;

        // Link as job input
        const { error: inputError } = await supabase
          .from('job_inputs')
          .insert({
            job_id: job.id,
            artifact_id: artifact.id,
            label: asset.label,
          });

        if (inputError) throw inputError;
      }

      toast.success('Job created!', {
        description: `"${title}" has been added to the Job Board and is ready for assignment.`,
        duration: 5000,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating job:', error);
      toast.error('Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  const AssetThumbnail = ({ asset, size = 'sm' }: { asset: AssetValidation | undefined; size?: 'sm' | 'lg' }) => {
    const sizeClasses = size === 'sm' ? 'w-16 h-16' : 'w-20 h-24';
    
    if (!asset) {
      return (
        <div className={`${sizeClasses} rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center`}>
          <XCircle className="h-5 w-5 text-muted-foreground/50" />
        </div>
      );
    }

    return (
      <div className={`
        ${sizeClasses} rounded-lg overflow-hidden border-2
        ${asset.exists ? 'border-green-500/50' : 'border-destructive/50 bg-destructive/10'}
      `}>
        {asset.exists && asset.url ? (
          <img
            src={asset.url}
            alt={asset.label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <XCircle className="h-5 w-5 text-destructive" />
          </div>
        )}
      </div>
    );
  };

  const validCount = assets.filter(a => a.exists).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Job: Foundation Face Replace</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Job Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Job Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter job title..."
            />
          </div>

          {/* Priority and Product Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">P1 - High</SelectItem>
                  <SelectItem value="2">P2 - Medium</SelectItem>
                  <SelectItem value="3">P3 - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product</Label>
              <div className="h-10 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                {lookName}
              </div>
            </div>
          </div>

          {validating ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validating assets...
            </div>
          ) : (
            <>
              {/* Visual Manifest Preview - 3 View Pairings */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Job Manifest Preview</Label>
                
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  {viewPairings.map((pairing) => (
                    <div key={pairing.view} className="flex flex-col items-center gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {pairing.view} View
                      </p>
                      
                      <div className="flex items-center gap-2">
                        {/* Head Render */}
                        <div className="flex flex-col items-center gap-1">
                          <AssetThumbnail asset={pairing.headRender} size="sm" />
                          <span className={`text-[10px] ${pairing.headRender?.exists ? 'text-foreground' : 'text-destructive'}`}>
                            Head
                          </span>
                        </div>
                        
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        
                        {/* Source Image */}
                        <div className="flex flex-col items-center gap-1">
                          <AssetThumbnail asset={pairing.sourceImage} size="lg" />
                          <span className={`text-[10px] ${pairing.sourceImage?.exists ? 'text-foreground' : 'text-destructive'}`}>
                            Source
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Validation Status */}
                <div className="flex items-center gap-2 text-sm">
                  {allAssetsValid ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-green-600">All 6 assets ready for job creation</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">
                        {validCount}/6 assets available — missing required assets
                      </span>
                    </>
                  )}
                </div>
              </div>

              {!allAssetsValid && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Cannot create job. Ensure all 3 views have:
                    <ul className="list-disc list-inside mt-1">
                      <li>A selected head render from the Review grid</li>
                      <li>An original source image uploaded in the Looks tab</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Instructions */}
              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions for Freelancer</Label>
                <Textarea
                  id="instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || validating || !allAssetsValid}
            className={allAssetsValid ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Job'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
