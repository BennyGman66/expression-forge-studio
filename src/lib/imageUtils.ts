/**
 * Tiered image loading strategy for performance optimization.
 * 
 * - tiny: ~120px - Dense grid, column headers, navigator
 * - thumb: ~280px - Default column view (identifiable faces)
 * - preview: ~800px - Focus mode / inspection
 * - full: ~2000px - Original resolution (explicit request only)
 */
export type ImageTier = 'tiny' | 'thumb' | 'preview' | 'full';

const TIER_SIZES: Record<ImageTier, number> = {
  tiny: 120,
  thumb: 280,
  preview: 800,
  full: 2000,
};

/**
 * Converts an image URL to the specified tier size.
 * Handles Scene7 CDN URLs by replacing wid/hei parameters.
 */
export function getImageUrl(
  url: string | null | undefined,
  tier: ImageTier = 'thumb'
): string {
  if (!url) return '';

  const size = TIER_SIZES[tier];

  // Scene7 CDN URL pattern - replace wid and hei parameters
  if (url.includes('wid=') || url.includes('hei=')) {
    return url
      .replace(/wid=\d+/, `wid=${size}`)
      .replace(/hei=\d+/, `hei=${size}`);
  }

  // For Supabase storage URLs, return as-is (they're already optimized or can be resized)
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
