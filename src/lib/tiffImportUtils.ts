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

// Types for deduplication / preflight
export type FileAction = 'add' | 'skip' | 'needs_review';

export interface PreflightFile extends ParsedFile {
  action: FileAction;
  skipReason?: string;
  existingLookId?: string;
}

export interface PreflightSummary {
  willAdd: number;
  willSkip: number;
  needsReview: number;
  newLooks: number;
  existingLooks: number;
}

export interface ExistingLookData {
  id: string;
  name: string;
  look_code: string | null;
  views: string[];
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
 * Run preflight check for deduplication
 * Determines which files should be added, skipped, or need manual review
 */
export function runPreflightCheck(
  parsedFiles: ParsedFile[],
  existingLooks: ExistingLookData[]
): { files: PreflightFile[]; summary: PreflightSummary } {
  const files: PreflightFile[] = [];
  
  // Build a set of existing lookCodes (for quick duplicate check)
  const existingLookCodes = new Set<string>();
  for (const look of existingLooks) {
    // Use look_code if set
    if (look.look_code) {
      existingLookCodes.add(look.look_code.toUpperCase());
    }
    
    // Also extract code from look name (handles "MW0MW43114GXR - short")
    const extractedFromName = extractLookKey(look.name);
    if (extractedFromName) {
      existingLookCodes.add(extractedFromName.toUpperCase());
    }
  }
  
  // Track new look codes we'll create
  const newLookCodes = new Set<string>();
  
  for (const parsed of parsedFiles) {
    const lookKey = parsed.lookKey?.toUpperCase() || null;
    
    if (!lookKey) {
      // No look code extracted - needs manual review
      files.push({
        ...parsed,
        action: 'needs_review',
        skipReason: 'Could not extract product code from filename',
      });
    } else if (existingLookCodes.has(lookKey)) {
      // Look code already exists in project - SKIP
      files.push({
        ...parsed,
        action: 'skip',
        skipReason: `Product ${lookKey} already exists in this project`,
      });
    } else {
      // New look code - ADD (regardless of view assignment)
      newLookCodes.add(lookKey);
      files.push({
        ...parsed,
        action: 'add',
      });
    }
  }
  
  // Calculate summary
  const summary: PreflightSummary = {
    willAdd: files.filter(f => f.action === 'add').length,
    willSkip: files.filter(f => f.action === 'skip').length,
    needsReview: files.filter(f => f.action === 'needs_review').length,
    newLooks: newLookCodes.size,
    existingLooks: 0,
  };
  
  return { files, summary };
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

/**
 * Recursively get all files from a FileSystemDirectoryEntry
 */
export async function getAllFilesFromDirectory(
  entry: FileSystemDirectoryEntry
): Promise<File[]> {
  const files: File[] = [];
  
  const readEntries = (dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      const reader = dirEntry.createReader();
      const allEntries: FileSystemEntry[] = [];
      
      const readBatch = () => {
        reader.readEntries((entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch();
          }
        }, reject);
      };
      
      readBatch();
    });
  };
  
  const processEntry = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      
      if (isSupportedImage(file)) {
        files.push(file);
      }
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const entries = await readEntries(dirEntry);
      await Promise.all(entries.map(processEntry));
    }
  };
  
  const entries = await readEntries(entry);
  await Promise.all(entries.map(processEntry));
  
  return files;
}

/**
 * Get files from DataTransfer (handles both files and folders)
 */
export async function getFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<File[]> {
  const files: File[] = [];
  const items = Array.from(dataTransfer.items);
  
  for (const item of items) {
    if (item.kind !== 'file') continue;
    
    // Try to get entry for folder support
    const entry = item.webkitGetAsEntry?.();
    
    if (entry) {
      if (entry.isDirectory) {
        const dirFiles = await getAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
        files.push(...dirFiles);
      } else if (entry.isFile) {
        const file = item.getAsFile();
        if (file && isSupportedImage(file)) {
          files.push(file);
        }
      }
    } else {
      // Fallback for browsers without webkitGetAsEntry
      const file = item.getAsFile();
      if (file && isSupportedImage(file)) {
        files.push(file);
      }
    }
  }
  
  return files;
}
