/**
 * Fixes broken storage URLs that contain unencoded hash (#) characters.
 * The hash character causes browsers to interpret the rest as a URL fragment.
 * 
 * This is a workaround for files uploaded before filename sanitization was added.
 */
export function fixBrokenStorageUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  // Find the last path segment (filename portion)
  const lastSlash = url.lastIndexOf('/');
  if (lastSlash === -1) return url;
  
  const basePath = url.slice(0, lastSlash + 1);
  const filename = url.slice(lastSlash + 1);
  
  // Encode any unencoded # characters in the filename
  // (already-encoded %23 won't be affected)
  const fixedFilename = filename.replace(/#/g, '%23');
  
  return basePath + fixedFilename;
}

/**
 * Sanitizes a filename for safe use in URLs and storage paths.
 * 
 * Removes/replaces problematic characters:
 * - # (hash) - causes URL fragment issues
 * - % - causes encoding issues
 * - Spaces - causes encoding issues
 * - Other special chars that may cause problems
 */
export function sanitizeFileName(filename: string): string {
  // Get extension
  const lastDot = filename.lastIndexOf('.');
  const ext = lastDot > 0 ? filename.slice(lastDot) : '';
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  
  // Replace problematic characters
  const sanitized = name
    .replace(/[#%?&=+]/g, '-')  // URL-unsafe characters
    .replace(/\s+/g, '_')        // Spaces → underscores
    .replace(/[^\w\-_.]/g, '')   // Remove other non-alphanumeric
    .replace(/-+/g, '-')         // Collapse multiple dashes
    .replace(/^-|-$/g, '');      // Trim leading/trailing dashes
  
  return sanitized + ext.toLowerCase();
}
