import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Identity, IdentityImage } from '../types';

interface UseImageOperationsReturn {
  moveImages: (
    imageIds: string[],
    sourceIdentityId: string,
    targetIdentityId: string,
    imagesByIdentity: Record<string, IdentityImage[]>
  ) => Promise<void>;
  splitToNewModel: (
    imageIds: string[],
    sourceIdentityId: string,
    runId: string,
    identities: Identity[],
    imagesByIdentity: Record<string, IdentityImage[]>,
    customName?: string
  ) => Promise<Identity | null>;
  mergeModels: (
    sourceIds: string[],
    targetId: string,
    identities: Identity[]
  ) => Promise<void>;
  deleteImages: (imageIds: string[]) => Promise<void>;
  deleteModels: (identityIds: string[]) => Promise<void>;
  isOperating: boolean;
}

export function useImageOperations(refetch: () => Promise<void>): UseImageOperationsReturn {
  const { toast } = useToast();
  const [isOperating, setIsOperating] = useState(false);

  const moveImages = useCallback(async (
    imageIds: string[],
    sourceIdentityId: string,
    targetIdentityId: string,
    imagesByIdentity: Record<string, IdentityImage[]>
  ) => {
    if (imageIds.length === 0 || sourceIdentityId === targetIdentityId) return;

    setIsOperating(true);
    try {
      // Update face_identity_images to point to new identity
      const { error } = await supabase
        .from('face_identity_images')
        .update({ identity_id: targetIdentityId })
        .in('id', imageIds);

      if (error) throw error;

      // Update image counts
      const sourceImages = imagesByIdentity[sourceIdentityId] || [];
      const sourceCount = sourceImages.length - imageIds.length;
      const targetImages = imagesByIdentity[targetIdentityId] || [];
      const targetCount = targetImages.length + imageIds.length;

      await Promise.all([
        supabase
          .from('face_identities')
          .update({ image_count: sourceCount })
          .eq('id', sourceIdentityId),
        supabase
          .from('face_identities')
          .update({ image_count: targetCount })
          .eq('id', targetIdentityId),
      ]);

      await refetch();
      toast({ title: `${imageIds.length} images moved successfully` });
    } catch (error) {
      console.error('Error moving images:', error);
      toast({ title: 'Failed to move images', variant: 'destructive' });
    } finally {
      setIsOperating(false);
    }
  }, [refetch, toast]);

  const splitToNewModel = useCallback(async (
    imageIds: string[],
    sourceIdentityId: string,
    runId: string,
    identities: Identity[],
    imagesByIdentity: Record<string, IdentityImage[]>,
    customName?: string
  ): Promise<Identity | null> => {
    if (imageIds.length === 0) return null;

    setIsOperating(true);
    try {
      const sourceIdentity = identities.find(i => i.id === sourceIdentityId);
      if (!sourceIdentity) throw new Error('Source identity not found');

      // Determine model name
      let modelName = customName?.trim();
      if (!modelName) {
        // Get next model number
        const maxNumber = identities.reduce((max, id) => {
          const match = id.name.match(/Model (\d+)/);
          return match ? Math.max(max, parseInt(match[1])) : max;
        }, 0);
        modelName = `Model ${maxNumber + 1}`;
      }

      // Get the first image to set as representative
      const firstImageData = imagesByIdentity[sourceIdentityId]?.find(img => imageIds.includes(img.id));
      const representativeImageId = firstImageData?.scrape_image_id || null;

      // Create new identity
      const { data: newIdentity, error: createError } = await supabase
        .from('face_identities')
        .insert({
          scrape_run_id: runId,
          name: modelName,
          gender: sourceIdentity.gender,
          image_count: imageIds.length,
          representative_image_id: representativeImageId,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Move selected images to new identity
      const { error: moveError } = await supabase
        .from('face_identity_images')
        .update({ identity_id: newIdentity.id })
        .in('id', imageIds);

      if (moveError) throw moveError;

      // Update source identity count
      const sourceImages = imagesByIdentity[sourceIdentityId] || [];
      await supabase
        .from('face_identities')
        .update({ image_count: sourceImages.length - imageIds.length })
        .eq('id', sourceIdentityId);

      await refetch();
      toast({
        title: 'Model split successfully',
        description: `Created ${newIdentity.name} with ${imageIds.length} images`,
      });

      return newIdentity as Identity;
    } catch (error) {
      console.error('Error splitting model:', error);
      toast({ title: 'Failed to split model', variant: 'destructive' });
      return null;
    } finally {
      setIsOperating(false);
    }
  }, [refetch, toast]);

  const mergeModels = useCallback(async (
    sourceIds: string[],
    targetId: string,
    identities: Identity[]
  ) => {
    if (sourceIds.length === 0) return;

    setIsOperating(true);
    try {
      const targetModel = identities.find(i => i.id === targetId);
      const sourceModels = identities.filter(i => sourceIds.includes(i.id));
      const totalImages = sourceModels.reduce((sum, m) => sum + m.image_count, 0);

      // Move all images from source models to target
      for (const sourceId of sourceIds) {
        await supabase
          .from('face_identity_images')
          .update({ identity_id: targetId })
          .eq('identity_id', sourceId);
      }

      // Update target model count
      const newCount = (targetModel?.image_count || 0) + totalImages;
      await supabase
        .from('face_identities')
        .update({ image_count: newCount })
        .eq('id', targetId);

      // Delete source models (now empty)
      await supabase
        .from('face_identities')
        .delete()
        .in('id', sourceIds);

      await refetch();
      toast({
        title: 'Models merged successfully',
        description: `${sourceModels.length} models merged into ${targetModel?.name}`,
      });
    } catch (error) {
      console.error('Error merging models:', error);
      toast({ title: 'Failed to merge models', variant: 'destructive' });
    } finally {
      setIsOperating(false);
    }
  }, [refetch, toast]);

  const deleteImages = useCallback(async (imageIds: string[]) => {
    if (imageIds.length === 0) return;

    setIsOperating(true);
    try {
      // Mark as ignored instead of deleting
      const { error } = await supabase
        .from('face_identity_images')
        .update({ is_ignored: true })
        .in('id', imageIds);

      if (error) throw error;

      await refetch();
      toast({ title: `${imageIds.length} images removed` });
    } catch (error) {
      console.error('Error deleting images:', error);
      toast({ title: 'Failed to delete images', variant: 'destructive' });
    } finally {
      setIsOperating(false);
    }
  }, [refetch, toast]);

  const deleteModels = useCallback(async (identityIds: string[]) => {
    if (identityIds.length === 0) return;

    setIsOperating(true);
    try {
      // Get all scrape_image_ids linked to these identities
      const { data: imageLinks } = await supabase
        .from('face_identity_images')
        .select('scrape_image_id')
        .in('identity_id', identityIds);

      const scrapeImageIds = (imageLinks || []).map(link => link.scrape_image_id);

      // Delete the identities (cascades to face_identity_images)
      const { error: deleteIdentityError } = await supabase
        .from('face_identities')
        .delete()
        .in('id', identityIds);

      if (deleteIdentityError) throw deleteIdentityError;

      // Delete the actual scrape images
      if (scrapeImageIds.length > 0) {
        await supabase
          .from('face_scrape_images')
          .delete()
          .in('id', scrapeImageIds);
      }

      await refetch();
      toast({
        title: `${identityIds.length} models deleted`,
        description: `${scrapeImageIds.length} images removed`,
      });
    } catch (error) {
      console.error('Error deleting models:', error);
      toast({ title: 'Failed to delete models', variant: 'destructive' });
    } finally {
      setIsOperating(false);
    }
  }, [refetch, toast]);

  return {
    moveImages,
    splitToNewModel,
    mergeModels,
    deleteImages,
    deleteModels,
    isOperating,
  };
}
