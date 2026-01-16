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
