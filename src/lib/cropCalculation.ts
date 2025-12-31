export interface FaceBoundingBox {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface CropCoordinates {
  x: number;      // percentage 0-100
  y: number;      // percentage 0-100
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
}

/**
 * Calculate head-and-shoulders crop from face bounding box
 * 
 * The face bounding box from MediaPipe includes the face area.
 * We expand this to include:
 * - ~30% above the face (forehead/hair)
 * - ~200% below the face (neck + shoulders + some chest)
 * - Center horizontally with padding
 * 
 * @param faceBbox - Face bounding box in pixels
 * @param imageWidth - Original image width in pixels
 * @param imageHeight - Original image height in pixels  
 * @param aspectRatio - Target aspect ratio ('1:1' or '4:5')
 * @returns Crop coordinates as percentages (0-100)
 */
export function calculateHeadAndShouldersCrop(
  faceBbox: FaceBoundingBox | null,
  imageWidth: number,
  imageHeight: number,
  aspectRatio: '1:1' | '4:5'
): CropCoordinates {
  // Fallback default crop if no face detected (portrait-focused upper portion)
  if (!faceBbox) {
    const targetRatio = aspectRatio === '1:1' ? 1 : 0.8; // width/height
    const defaultWidth = 70; // 70% of image width
    const defaultHeight = defaultWidth / targetRatio;
    
    return {
      x: (100 - defaultWidth) / 2,
      y: 5, // Start 5% from top for portrait framing
      width: defaultWidth,
      height: Math.min(defaultHeight, 90),
    };
  }

  // Calculate face dimensions as percentages
  const faceCenterXPercent = ((faceBbox.originX + faceBbox.width / 2) / imageWidth) * 100;
  const faceTopPercent = (faceBbox.originY / imageHeight) * 100;
  const faceHeightPercent = (faceBbox.height / imageHeight) * 100;
  const faceWidthPercent = (faceBbox.width / imageWidth) * 100;

  // Tight expansion factors for head-and-shoulders framing
  const aboveFaceMultiplier = 0.15;  // 15% of face height above (just hair)
  const belowFaceMultiplier = 1.5;   // 150% of face height below (to shoulder edge)
  const horizontalPadding = 1.3;     // 130% of face width total (tighter)

  // Calculate vertical extent
  const topY = faceTopPercent - (faceHeightPercent * aboveFaceMultiplier);
  const bottomExtent = faceHeightPercent * (1 + belowFaceMultiplier);
  
  // Calculate horizontal extent (centered on face)
  const cropWidthFromFace = faceWidthPercent * horizontalPadding;
  
  // Determine final dimensions based on aspect ratio
  const targetRatio = aspectRatio === '1:1' ? 1 : 0.8; // width/height ratio
  
  // Start with the vertical extent and calculate width from it
  let cropHeight = bottomExtent + (faceHeightPercent * aboveFaceMultiplier);
  let cropWidth = cropHeight * targetRatio;
  
  // If calculated width is narrower than the face-based width, use face-based width instead
  if (cropWidth < cropWidthFromFace) {
    cropWidth = cropWidthFromFace;
    cropHeight = cropWidth / targetRatio;
  }
  
  // Center horizontally on the face
  let cropX = faceCenterXPercent - cropWidth / 2;
  let cropY = Math.max(0, topY);
  
  // Clamp to image boundaries
  if (cropX < 0) cropX = 0;
  if (cropX + cropWidth > 100) {
    cropX = 100 - cropWidth;
    if (cropX < 0) {
      cropX = 0;
      cropWidth = 100;
      cropHeight = cropWidth / targetRatio;
    }
  }
  
  if (cropY + cropHeight > 100) {
    cropHeight = 100 - cropY;
    cropWidth = cropHeight * targetRatio;
    // Re-center horizontally
    cropX = faceCenterXPercent - cropWidth / 2;
    if (cropX < 0) cropX = 0;
    if (cropX + cropWidth > 100) cropX = 100 - cropWidth;
  }

  return {
    x: Math.max(0, Math.min(100, cropX)),
    y: Math.max(0, Math.min(100, cropY)),
    width: Math.max(10, Math.min(100, cropWidth)),
    height: Math.max(10, Math.min(100, cropHeight)),
  };
}

/**
 * Get the best face detection from multiple detections
 * Prioritizes by confidence and size
 */
export function getBestFaceDetection(
  detections: Array<{ boundingBox: FaceBoundingBox; confidence: number }>
): FaceBoundingBox | null {
  if (detections.length === 0) return null;
  
  // Sort by confidence * area (prefer larger, more confident detections)
  const sorted = [...detections].sort((a, b) => {
    const areaA = a.boundingBox.width * a.boundingBox.height;
    const areaB = b.boundingBox.width * b.boundingBox.height;
    const scoreA = a.confidence * areaA;
    const scoreB = b.confidence * areaB;
    return scoreB - scoreA;
  });
  
  return sorted[0].boundingBox;
}
