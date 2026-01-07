import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts a high-res Scene7 image URL to a thumbnail version
 * Reduces wid/hei from 2000 to specified size (default 400)
 */
export function getThumbnailUrl(url: string | null | undefined, size: number = 400): string {
  if (!url) return '';
  
  // Scene7 CDN URL pattern - replace wid and hei parameters
  return url
    .replace(/wid=\d+/, `wid=${size}`)
    .replace(/hei=\d+/, `hei=${size}`);
}
