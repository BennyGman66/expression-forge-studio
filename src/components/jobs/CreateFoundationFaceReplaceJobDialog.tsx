import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    if (open) {
      validateAssets();
    }
  }, [open, lookId]);

  const validateAssets = async () => {
    setValidating(true);
    const validations: AssetValidation[] = [];

    try {
      // Fetch selected outputs for each view (front, side, back)
      const { data: selectedOutputs } = await supabase
        .from('face_application_outputs')
        .select('id, view, stored_url, is_selected')
        .eq('is_selected', true)
        .in('view', ['front', 'side', 'back']);

      // Filter by look_id through the job
      const { data: jobs } = await supabase
        .from('face_application_jobs')
        .select('id')
        .eq('look_id', lookId);

      const jobIds = jobs?.map((j) => j.id) || [];

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
          label: `Head Render (${view.charAt(0).toUpperCase() + view.slice(1)})`,
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
        label: 'Original Look Image',
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
      const title = config.titleFormat(lookName);

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Job: Foundation Face Replace</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Look: <span className="font-medium text-foreground">{lookName}</span>
          </div>

          {/* Asset Validation */}
          <div className="space-y-2">
            <Label>Required Assets</Label>
            {validating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Validating assets...
              </div>
            ) : (
              <div className="space-y-1">
                {assets.map((asset) => (
                  <div
                    key={asset.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    {asset.exists ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className={asset.exists ? '' : 'text-destructive'}>
                      {asset.label}
                    </span>
                    {asset.exists && asset.url && (
                      <img
                        src={asset.url}
                        alt={asset.label}
                        className="h-8 w-8 rounded object-cover ml-auto"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!allAssetsValid && !validating && (
            <Alert variant="destructive">
              <AlertDescription>
                Cannot create job. Please select outputs for all required views
                (Front, Side, Back) in the Review tab first.
              </AlertDescription>
            </Alert>
          )}

          {/* Instructions */}
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={loading || validating || !allAssetsValid}
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
