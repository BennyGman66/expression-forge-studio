import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DigitalTwin } from "@/types/digital-twin";
import { toast } from "sonner";

interface PromoteToTwinParams {
  identityId: string;
  name: string;
  gender: string | null;
  brandId: string | null;
}

export function usePromoteToTwin() {
  const [isPromoting, setIsPromoting] = useState(false);

  const promoteIdentityToTwin = async ({
    identityId,
    name,
    gender,
    brandId,
  }: PromoteToTwinParams): Promise<DigitalTwin | null> => {
    setIsPromoting(true);
    try {
      // 1. Fetch the identity with its images and crops
      const { data: identity, error: identityError } = await supabase
        .from("face_identities")
        .select(`
          *,
          face_identity_images!inner(
            id,
            scrape_image_id,
            view,
            is_ignored,
            face_scrape_images!inner(
              id,
              source_url,
              stored_url,
              face_crops(
                crop_x,
                crop_y,
                crop_width,
                crop_height,
                cropped_stored_url
              )
            )
          )
        `)
        .eq("id", identityId)
        .single();

      if (identityError) throw identityError;

      // Get representative image URL
      const representativeImage = identity.face_identity_images?.find(
        (img: any) => img.scrape_image_id === identity.representative_image_id
      );
      const representativeUrl = representativeImage?.face_scrape_images?.face_crops?.[0]?.cropped_stored_url
        || representativeImage?.face_scrape_images?.stored_url
        || identity.face_identity_images?.[0]?.face_scrape_images?.stored_url;

      // 2. Create the digital twin
      const { data: twin, error: twinError } = await supabase
        .from("digital_twins")
        .insert({
          name,
          gender,
          brand_id: brandId,
          representative_image_url: representativeUrl,
          source_scrape_run_id: identity.scrape_run_id,
          image_count: identity.face_identity_images?.filter((img: any) => !img.is_ignored).length || 0,
        })
        .select()
        .single();

      if (twinError) throw twinError;

      // 3. Copy images to digital_twin_images
      const twinImages = identity.face_identity_images
        ?.filter((img: any) => !img.is_ignored)
        .map((img: any) => ({
          twin_id: twin.id,
          source_url: img.face_scrape_images.source_url,
          stored_url: img.face_scrape_images.stored_url,
          view: img.view || "unknown",
          crop_data: img.face_scrape_images.face_crops?.[0]
            ? {
                crop_x: img.face_scrape_images.face_crops[0].crop_x,
                crop_y: img.face_scrape_images.face_crops[0].crop_y,
                crop_width: img.face_scrape_images.face_crops[0].crop_width,
                crop_height: img.face_scrape_images.face_crops[0].crop_height,
              }
            : null,
        }));

      if (twinImages && twinImages.length > 0) {
        const { error: imagesError } = await supabase
          .from("digital_twin_images")
          .insert(twinImages);

        if (imagesError) throw imagesError;
      }

      // 4. Link the face identity to the twin and update its name
      const { error: linkError } = await supabase
        .from("face_identities")
        .update({
          linked_twin_id: twin.id,
          name: name, // Sync the name with the twin
        })
        .eq("id", identityId);

      if (linkError) throw linkError;

      toast.success(`Created Digital Twin: ${name}`);
      return twin;
    } catch (error) {
      console.error("Error promoting to twin:", error);
      toast.error("Failed to create Digital Twin");
      return null;
    } finally {
      setIsPromoting(false);
    }
  };

  return { promoteIdentityToTwin, isPromoting };
}
