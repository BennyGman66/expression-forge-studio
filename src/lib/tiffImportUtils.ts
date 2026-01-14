/**
 * TIFF Import Utilities
 * Handles filename parsing and look grouping for bulk TIFF imports
 */

export interface ParsedFile {
  file: File;
  originalFilename: string;
  lookKey: string | null;
  productDescriptor: string | null;
  sequenceNumber: string | null;
  inferredView: 'front' | 'back' | 'side' | 'detail' | 'unassigned';
}

export interface LookGroup {
  lookKey: string;
  lookName: string;
  files: ParsedFile[];
}

/**
 * Extract SKU-like look key from filename
 * Matches 8+ character alphanumeric codes like MW0MW43114GXR, XAOXA00059DW6
 */
export function extractLookKey(filename: string): string | null {
  // Remove extension first
  const nameWithoutExt = filename.replace(/\.(tiff?|png|jpe?g)$/i, '');
  
  // Look for 8+ character alphanumeric codes (letters and numbers mixed)
  const matches = nameWithoutExt.match(/[A-Z0-9]{8,}/gi);
  
  if (!matches || matches.length === 0) {
    // Fallback: try to use leading numeric group like "05_", "023_"
    const leadingMatch = nameWithoutExt.match(/^(\d+)_/);
    return leadingMatch ? leadingMatch[1] : null;
  }
  
  // Prefer codes that have both letters AND numbers (more likely to be SKUs)
  const skuLike = matches.find(m => /[A-Z]/i.test(m) && /[0-9]/.test(m));
  return skuLike ? skuLike.toUpperCase() : matches[0].toUpperCase();
}

/**
 * Extract product descriptor from filename
 * Matches words like "short", "shirt", "bag", "jas" before # or at end
 */
export function extractProductDescriptor(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.(tiff?|png|jpe?g)$/i, '');
  
  // Match word before # symbol or at end of filename
  const match = nameWithoutExt.match(/\s([a-z]+)(?:#|\s*\d*$)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract sequence number from filename (e.g., #105)
 */
export function extractSequenceNumber(filename: string): string | null {
  const match = filename.match(/#(\d+)/);
  return match ? match[1] : null;
}

/**
 * Infer view type from filename keywords
 */
export function inferViewType(filename: string): ParsedFile['inferredView'] {
  const lower = filename.toLowerCase();
  if (lower.includes('front')) return 'front';
  if (lower.includes('back')) return 'back';
  if (lower.includes('side')) return 'side';
  if (lower.includes('detail')) return 'detail';
  return 'unassigned';
}

/**
 * Check if a file is a TIFF based on extension
 */
export function isTiffFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'tif' || ext === 'tiff';
}

/**
 * Check if a file is a supported image (TIFF, PNG, JPG)
 */
export function isSupportedImage(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['tif', 'tiff', 'png', 'jpg', 'jpeg'].includes(ext || '');
}

/**
 * Parse a file to extract metadata
 */
export function parseFile(file: File): ParsedFile {
  return {
    file,
    originalFilename: file.name,
    lookKey: extractLookKey(file.name),
    productDescriptor: extractProductDescriptor(file.name),
    sequenceNumber: extractSequenceNumber(file.name),
    inferredView: inferViewType(file.name),
  };
}

/**
 * Group parsed files by look key
 */
export function groupFilesByLook(files: ParsedFile[]): LookGroup[] {
  const groups = new Map<string, ParsedFile[]>();
  
  for (const file of files) {
    const key = file.lookKey || 'UNMATCHED';
    const existing = groups.get(key) || [];
    existing.push(file);
    groups.set(key, existing);
  }
  
  // Convert to array and sort by lookKey
  const result: LookGroup[] = [];
  
  for (const [lookKey, groupFiles] of groups) {
    // Generate a look name from the first file's product descriptor or the lookKey
    const firstDescriptor = groupFiles[0]?.productDescriptor;
    const lookName = firstDescriptor 
      ? `${lookKey} - ${firstDescriptor}`
      : lookKey === 'UNMATCHED' 
        ? 'Unmatched Files'
        : lookKey;
    
    result.push({
      lookKey,
      lookName,
      files: groupFiles.sort((a, b) => 
        a.originalFilename.localeCompare(b.originalFilename)
      ),
    });
  }
  
  // Sort so UNMATCHED is last
  return result.sort((a, b) => {
    if (a.lookKey === 'UNMATCHED') return 1;
    if (b.lookKey === 'UNMATCHED') return -1;
    return a.lookKey.localeCompare(b.lookKey);
  });
}

/**
 * Move a file from one group to another
 */
export function moveFileBetweenGroups(
  groups: LookGroup[],
  fileIndex: number,
  fromLookKey: string,
  toLookKey: string
): LookGroup[] {
  const result = groups.map(g => ({ ...g, files: [...g.files] }));
  
  const fromGroup = result.find(g => g.lookKey === fromLookKey);
  const toGroup = result.find(g => g.lookKey === toLookKey);
  
  if (!fromGroup || !toGroup || fileIndex < 0 || fileIndex >= fromGroup.files.length) {
    return groups;
  }
  
  const [file] = fromGroup.files.splice(fileIndex, 1);
  toGroup.files.push(file);
  
  // Remove empty groups (except UNMATCHED)
  return result.filter(g => g.files.length > 0 || g.lookKey === 'UNMATCHED');
}

/**
 * Rename a look group
 */
export function renameLookGroup(
  groups: LookGroup[],
  lookKey: string,
  newName: string
): LookGroup[] {
  return groups.map(g => 
    g.lookKey === lookKey ? { ...g, lookName: newName } : g
  );
}

/**
 * Update view type for a specific file in a group
 */
export function updateFileView(
  groups: LookGroup[],
  lookKey: string,
  fileIndex: number,
  newView: ParsedFile['inferredView']
): LookGroup[] {
  return groups.map(g => {
    if (g.lookKey !== lookKey) return g;
    return {
      ...g,
      files: g.files.map((f, i) => 
        i === fileIndex ? { ...f, inferredView: newView } : f
      ),
    };
  });
}
