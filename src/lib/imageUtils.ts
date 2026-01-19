/**
 * Tiered image loading strategy for performance optimization.
 * 
 * - tiny: ~120px - Dense grid, column headers, navigator
 * - thumb: ~280px - Default column view (identifiable faces)
 * - preview: ~800px - Focus mode / inspection
 * - full: ~2000px - Original resolution (explicit request only)
 */
export type ImageTier = 'tiny' | 'thumb' | 'preview' | 'full';

export const TIER_SIZES: Record<ImageTier, number> = {
  tiny: 120,
  thumb: 280,
  preview: 800,
  full: 2000,
};

/**
 * Detects if a URL is a Supabase Storage URL.
 */
function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('.supabase.co/storage/v1/object/');
}

/**
 * Converts a Supabase Storage URL to use the render/image endpoint for resizing.
 * 
 * Input: https://xxx.supabase.co/storage/v1/object/public/bucket/path/image.png
 * Output: https://xxx.supabase.co/storage/v1/render/image/public/bucket/path/image.png?width=280&height=280&resize=cover
 */
function getSupabaseResizedUrl(url: string, size: number): string {
  // Convert /object/ to /render/image/
  const resizedUrl = url.replace(
    '/storage/v1/object/',
    '/storage/v1/render/image/'
  );
  
  // Add resize parameters - use contain to preserve full image without cropping
  const separator = resizedUrl.includes('?') ? '&' : '?';
  return `${resizedUrl}${separator}width=${size}&resize=contain`;
}

/**
 * Converts an image URL to the specified tier size.
 * Handles Scene7 CDN URLs and Supabase Storage URLs.
 */
export function getImageUrl(
  url: string | null | undefined,
  tier: ImageTier = 'thumb'
): string {
  if (!url) return '';

  // For full tier, return original URL
  if (tier === 'full') return url;

  const size = TIER_SIZES[tier];

  // Scene7 CDN URL pattern - replace wid and hei parameters
  if (url.includes('wid=') || url.includes('hei=')) {
    return url
      .replace(/wid=\d+/, `wid=${size}`)
      .replace(/hei=\d+/, `hei=${size}`);
  }

  // Supabase Storage URLs - use render/image endpoint
  if (isSupabaseStorageUrl(url)) {
    return getSupabaseResizedUrl(url, size);
  }

  // For other URLs, return as-is
  return url;
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use getImageUrl with tier instead
 */
export function getThumbnailUrl(url: string | null | undefined, size: number = 400): string {
  if (!url) return '';
  
  return url
    .replace(/wid=\d+/, `wid=${size}`)
    .replace(/hei=\d+/, `hei=${size}`);
}
