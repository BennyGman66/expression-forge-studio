import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Identity, IdentityImage, GenderFilter } from '../types';

interface UseModelDataReturn {
  identities: Identity[];
  imagesByIdentity: Record<string, IdentityImage[]>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useModelData(
  runId: string | null,
  genderFilter: GenderFilter
): UseModelDataReturn {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [imagesByIdentity, setImagesByIdentity] = useState<Record<string, IdentityImage[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const fetchIdentities = useCallback(async () => {
    if (!runId) {
      setIdentities([]);
      setImagesByIdentity({});
      return;
    }

    setIsLoading(true);

    try {
      // Fetch identities with representative images
      let query = supabase
        .from('face_identities')
        .select(`
          *,
          representative_image:face_scrape_images!face_identities_representative_image_id_fkey(stored_url, source_url)
        `)
        .eq('scrape_run_id', runId)
        .is('archived_at', null)
        .order('image_count', { ascending: false });

      if (genderFilter !== 'all') {
        query = query.eq('gender', genderFilter);
      }

      const { data: identityData, error: identityError } = await query;

      if (identityError) {
        console.error('Error fetching identities:', identityError);
        setIsLoading(false);
        return;
      }

      // Get talent_ids that are set
      const talentIds = (identityData || [])
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

      const identitiesWithUrls: Identity[] = (identityData || []).map((identity: any) => ({
        ...identity,
        representative_image_url: identity.representative_image?.stored_url || identity.representative_image?.source_url || null,
        digital_talent: identity.talent_id ? digitalTalentsMap[identity.talent_id] || null : null,
      }));

      setIdentities(identitiesWithUrls);

      // Fetch all images for all identities in one query
      const identityIds = identitiesWithUrls.map(i => i.id);
      
      if (identityIds.length > 0) {
        const { data: imagesData, error: imagesError } = await supabase
          .from('face_identity_images')
          .select(`
            *,
            scrape_image:face_scrape_images(id, stored_url, source_url, gender)
          `)
          .in('identity_id', identityIds)
          .eq('is_ignored', false);

        if (imagesError) {
          console.error('Error fetching images:', imagesError);
        } else {
          // Group images by identity
          const grouped: Record<string, IdentityImage[]> = {};
          identityIds.forEach(id => { grouped[id] = []; });
          
          (imagesData || []).forEach((img: IdentityImage) => {
            if (grouped[img.identity_id]) {
              grouped[img.identity_id].push(img);
            }
          });

          setImagesByIdentity(grouped);
        }
      }
    } catch (error) {
      console.error('Error in fetchIdentities:', error);
    } finally {
      setIsLoading(false);
    }
  }, [runId, genderFilter]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  return {
    identities,
    imagesByIdentity,
    isLoading,
    refetch: fetchIdentities,
  };
}
