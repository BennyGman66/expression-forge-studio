import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface FaceDetectionResult {
  boundingBox: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  keypoints: Array<{
    x: number;
    y: number;
    name?: string;
  }>;
  confidence: number;
}

interface UseFaceDetectorReturn {
  detectFaces: (imageElement: HTMLImageElement) => Promise<FaceDetectionResult[]>;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
}

// Singleton instance
let detectorInstance: FaceDetector | null = null;
let initPromise: Promise<FaceDetector> | null = null;

async function initializeDetector(): Promise<FaceDetector> {
  if (detectorInstance) return detectorInstance;
  
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    
    detectorInstance = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU'
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
    
    return detectorInstance;
  })();
  
  return initPromise;
}

export function useFaceDetector(): UseFaceDetectorReturn {
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);

  useEffect(() => {
    let mounted = true;
    
    initializeDetector()
      .then((detector) => {
        if (mounted) {
          detectorRef.current = detector;
          setIsReady(true);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to initialize FaceDetector:', err);
          setError(err.message || 'Failed to initialize face detector');
          setIsLoading(false);
        }
      });
    
    return () => {
      mounted = false;
    };
  }, []);

  const detectFaces = useCallback(async (imageElement: HTMLImageElement): Promise<FaceDetectionResult[]> => {
    if (!detectorRef.current) {
      throw new Error('Face detector not initialized');
    }
    
    const result = detectorRef.current.detect(imageElement);
    
    return result.detections.map((detection) => {
      const bbox = detection.boundingBox!;
      return {
        boundingBox: {
          originX: bbox.originX,
          originY: bbox.originY,
          width: bbox.width,
          height: bbox.height,
        },
        keypoints: detection.keypoints?.map((kp: any) => ({
          x: kp.x,
          y: kp.y,
          name: kp.name,
        })) || [],
        confidence: detection.categories?.[0]?.score || 0,
      };
    });
  }, []);

  return { detectFaces, isReady, isLoading, error };
}
