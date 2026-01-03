import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { JOB_TYPE_CONFIG } from '@/lib/jobTypes';

interface CreateFoundationFaceReplaceJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookId: string;
  lookName: string;
  projectId?: string;
}

interface AssetValidation {
  key: string;
  label: string;
  view: string;
  exists: boolean;
  url?: string;
  sourceId?: string;
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
  const [instructions, setInstructions] = useState(
    JOB_TYPE_CONFIG.FOUNDATION_FACE_REPLACE.defaultInstructions
  );

  const allAssetsValid = assets.length > 0 && assets.every((a) => a.exists);
  const headRenders = assets.filter(a => a.key.startsWith('HEAD_RENDER'));
  const originalLook = assets.find(a => a.key === 'LOOK_ORIGINAL');

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

      if (jobIds.length === 0) {
        setAssets([]);
        setValidating(false);
        return;
      }

      // Fetch selected outputs for each view
      const { data: lookOutputs } = await supabase
        .from('face_application_outputs')
        .select('id, view, stored_url, is_selected, job_id')
        .in('job_id', jobIds)
        .eq('is_selected', true);

      const outputsByView: Record<string, { id: string; url: string }> = {};
      lookOutputs?.forEach((o) => {
        if (o.is_selected && o.stored_url) {
          outputsByView[o.view] = { id: o.id, url: o.stored_url };
        }
      });

      // Check head renders
      const headViews = ['front', 'side', 'back'];
      for (const view of headViews) {
        const output = outputsByView[view];
        validations.push({
          key: `HEAD_RENDER_${view.toUpperCase()}`,
          label: view.charAt(0).toUpperCase() + view.slice(1),
          view,
          exists: !!output,
          url: output?.url,
          sourceId: output?.id,
        });
      }

      // Fetch original look image (front source)
      const { data: lookSource } = await supabase
        .from('look_source_images')
        .select('id, source_url, view')
        .eq('look_id', lookId)
        .eq('view', 'front')
        .maybeSingle();

      validations.push({
        key: 'LOOK_ORIGINAL',
        label: 'Original Look',
        view: 'front',
        exists: !!lookSource?.source_url,
        url: lookSource?.source_url,
        sourceId: lookSource?.id,
      });

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
      const config = JOB_TYPE_CONFIG.FOUNDATION_FACE_REPLACE;

      // Create the job
      const { data: job, error: jobError } = await supabase
        .from('unified_jobs')
        .insert({
          type: 'FOUNDATION_FACE_REPLACE',
          status: 'OPEN',
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

        // Create artifact
        const { data: artifact, error: artifactError } = await supabase
          .from('unified_artifacts')
          .insert({
            type: asset.key as any,
            file_url: asset.url,
            preview_url: asset.url,
            look_id: lookId,
            project_id: projectId || null,
            source_table: asset.key === 'LOOK_ORIGINAL' ? 'look_source_images' : 'face_application_outputs',
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

      toast.success('Job created successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating job:', error);
      toast.error('Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Job: Foundation Face Replace</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Look: <span className="font-medium text-foreground">{lookName}</span>
          </div>

          {validating ? (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validating assets...
            </div>
          ) : (
            <>
              {/* Visual Manifest Preview */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">Job Manifest Preview</Label>
                
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center p-4 bg-muted/50 rounded-lg">
                  {/* Head Renders */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Selected Head Renders
                    </p>
                    <div className="flex gap-2">
                      {headRenders.map((asset) => (
                        <div key={asset.key} className="flex flex-col items-center gap-1">
                          <div className={`
                            w-20 h-20 rounded-lg overflow-hidden border-2
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
                                <XCircle className="h-6 w-6 text-destructive" />
                              </div>
                            )}
                          </div>
                          <span className={`text-xs ${asset.exists ? 'text-foreground' : 'text-destructive'}`}>
                            {asset.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ArrowRight className="h-6 w-6" />
                    <span className="text-xs">+</span>
                  </div>

                  {/* Original Look */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Original Look Image
                    </p>
                    <div className="flex flex-col items-center gap-1">
                      <div className={`
                        w-24 h-32 rounded-lg overflow-hidden border-2
                        ${originalLook?.exists ? 'border-green-500/50' : 'border-destructive/50 bg-destructive/10'}
                      `}>
                        {originalLook?.exists && originalLook.url ? (
                          <img
                            src={originalLook.url}
                            alt="Original Look"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <XCircle className="h-6 w-6 text-destructive" />
                          </div>
                        )}
                      </div>
                      <span className={`text-xs ${originalLook?.exists ? 'text-foreground' : 'text-destructive'}`}>
                        Source
                      </span>
                    </div>
                  </div>
                </div>

                {/* Validation Status */}
                <div className="flex items-center gap-2 text-sm">
                  {allAssetsValid ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-green-600">All 4 assets ready for job creation</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-destructive">Missing required assets</span>
                    </>
                  )}
                </div>
              </div>

              {!allAssetsValid && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Cannot create job. Please select outputs for all required views
                    (Front, Side, Back) in the Review tab first.
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
