import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Play, RefreshCw, ChevronLeft, ChevronRight, RotateCcw, Check, Scan, AlertTriangle, Sparkles, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFaceDetector } from "@/hooks/useFaceDetector";
import { calculateHeadAndShouldersCrop, getBestFaceDetection } from "@/lib/cropCalculation";
import type { FaceScrapeImage, FaceCrop, FaceJob } from "@/types/face-creator";

interface CropEditorPanelProps {
  runId: string | null;
}

interface ImageWithCrop extends FaceScrapeImage {
  crop?: FaceCrop;
  noFaceDetected?: boolean;
  isBackView?: boolean;
}

interface AIDetectionResult {
  faceDetected: boolean;
  faceBoundingBox: { x: number; y: number; width: number; height: number } | null;
  suggestedCrop: { x: number; y: number; width: number; height: number };
  isBackView: boolean;
  confidence: number;
}

interface CropReferenceImage {
  id: string;
  original_image_url: string;
  cropped_image_url: string;
  view_type: 'front' | 'back';
  is_active: boolean;
}

interface CropCorrection {
  id: string;
  scrape_image_id: string;
  view_type: string;
  ai_crop_x: number;
  ai_crop_y: number;
  ai_crop_width: number;
  ai_crop_height: number;
  user_crop_x: number;
  user_crop_y: number;
  user_crop_width: number;
  user_crop_height: number;
}

interface AILastSuggestion {
  imageId: string;
  crop: { x: number; y: number; width: number; height: number };
}

export function CropEditorPanel({ runId }: CropEditorPanelProps) {
  const { toast } = useToast();
  const { detectFaces, isReady: detectorReady, isLoading: detectorLoading } = useFaceDetector();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const hiddenImgRef = useRef<HTMLImageElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [images, setImages] = useState<ImageWithCrop[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [aiDetecting, setAiDetecting] = useState(false);
  const [useAiDetection, setUseAiDetection] = useState(true);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, failed: 0 });
  const [job, setJob] = useState<FaceJob | null>(null);
  const [uploadingRefs, setUploadingRefs] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5'>('1:1');
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [interactionMode, setInteractionMode] = useState<'none' | 'move' | 'nw' | 'ne' | 'sw' | 'se'>('none');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startCrop, setStartCrop] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [imageBounds, setImageBounds] = useState({ offsetX: 0, offsetY: 0, width: 0, height: 0 });
  const [imageBoundsReady, setImageBoundsReady] = useState(false);
  const [referenceImages, setReferenceImages] = useState<CropReferenceImage[]>([]);
  const [recentCorrections, setRecentCorrections] = useState<CropCorrection[]>([]);
  const [aiLastSuggestion, setAiLastSuggestion] = useState<AILastSuggestion | null>(null);

  const selectedImage = images[selectedIndex];

  useEffect(() => {
    if (!runId) return;
    
    fetchImagesWithCrops();
    fetchJob();
    fetchReferenceImages();
    fetchRecentCorrections();

    const channel = supabase
      .channel('crop-editor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_jobs' },
        (payload) => {
          if ((payload.new as any)?.scrape_run_id === runId) {
            fetchJob();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'face_crops' },
        () => fetchImagesWithCrops()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId]);

  // Fetch recent crop corrections for few-shot learning
  const fetchRecentCorrections = async () => {
    const { data, error } = await supabase
      .from('crop_corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (data && !error) {
      setRecentCorrections(data as CropCorrection[]);
      console.log(`[CropEditor] Loaded ${data.length} recent corrections for learning`);
    }
  };

  // Check if reference images have valid HTTPS URLs
  const hasValidReferenceUrls = useCallback(() => {
    return referenceImages.length > 0 && 
      referenceImages.every(r => 
        r.original_image_url?.startsWith('https://') && 
        r.cropped_image_url?.startsWith('https://')
      );
  }, [referenceImages]);

  // Fetch reference images for few-shot learning
  const fetchReferenceImages = async () => {
    const { data, error } = await supabase
      .from('crop_reference_images')
      .select('*')
      .eq('is_active', true);
    
    if (data && !error) {
      setReferenceImages(data as CropReferenceImage[]);
      const validCount = data.filter(r => 
        r.original_image_url?.startsWith('https://') && 
        r.cropped_image_url?.startsWith('https://')
      ).length;
      console.log(`[CropEditor] Loaded ${data.length} reference images (${validCount} with valid HTTPS URLs)`);
    }
  };

  // Convert image URL to base64 with detailed error handling
  const fetchImageAsBase64 = async (url: string): Promise<string> => {
    console.log(`[CropEditor] Fetching ${url}...`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      console.log(`[CropEditor] Got blob for ${url}: ${blob.size} bytes, type: ${blob.type}`);
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (!base64) {
            reject(new Error(`Failed to extract base64 from ${url}`));
            return;
          }
          console.log(`[CropEditor] Converted ${url} to base64: ${base64.length} chars`);
          resolve(base64);
        };
        reader.onerror = () => reject(new Error(`FileReader error for ${url}`));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error(`[CropEditor] Error fetching ${url}:`, error);
      throw error;
    }
  };

  // Upload reference images to Supabase storage
  const handleUploadReferenceImages = async (): Promise<boolean> => {
    setUploadingRefs(true);
    console.log('[CropEditor] === STARTING REFERENCE IMAGE UPLOAD ===');
    
    try {
      // Reference images configuration
      const referenceConfigs = [
        { localPath: 'front/original-1.png', storagePath: 'front/original-1.png', viewType: 'front' as const, isCropped: false },
        { localPath: 'front/cropped-1.png', storagePath: 'front/cropped-1.png', viewType: 'front' as const, isCropped: true },
        { localPath: 'front/original-2.png', storagePath: 'front/original-2.png', viewType: 'front' as const, isCropped: false },
        { localPath: 'front/cropped-2.png', storagePath: 'front/cropped-2.png', viewType: 'front' as const, isCropped: true },
        { localPath: 'front/original-3.png', storagePath: 'front/original-3.png', viewType: 'front' as const, isCropped: false },
        { localPath: 'front/cropped-3.png', storagePath: 'front/cropped-3.png', viewType: 'front' as const, isCropped: true },
        { localPath: 'front/original-4.png', storagePath: 'front/original-4.png', viewType: 'front' as const, isCropped: false },
        { localPath: 'front/cropped-4.png', storagePath: 'front/cropped-4.png', viewType: 'front' as const, isCropped: true },
        { localPath: 'back/original-1.png', storagePath: 'back/original-1.png', viewType: 'back' as const, isCropped: false },
        { localPath: 'back/cropped-1.png', storagePath: 'back/cropped-1.png', viewType: 'back' as const, isCropped: true },
        { localPath: 'back/original-2.png', storagePath: 'back/original-2.png', viewType: 'back' as const, isCropped: false },
        { localPath: 'back/cropped-2.png', storagePath: 'back/cropped-2.png', viewType: 'back' as const, isCropped: true },
        { localPath: 'back/original-3.png', storagePath: 'back/original-3.png', viewType: 'back' as const, isCropped: false },
        { localPath: 'back/cropped-3.png', storagePath: 'back/cropped-3.png', viewType: 'back' as const, isCropped: true },
      ];
      
      // Fetch each image individually with error handling
      const images: Array<{
        name: string;
        storagePath: string;
        viewType: 'front' | 'back';
        isCropped: boolean;
        base64Data: string;
      }> = [];
      
      for (const config of referenceConfigs) {
        try {
          const url = `/reference-crops/${config.localPath}`;
          const base64Data = await fetchImageAsBase64(url);
          images.push({
            name: config.localPath,
            storagePath: config.storagePath,
            viewType: config.viewType,
            isCropped: config.isCropped,
            base64Data
          });
        } catch (err) {
          console.error(`[CropEditor] Failed to fetch ${config.localPath}:`, err);
          // Continue with other images
        }
      }
      
      if (images.length === 0) {
        throw new Error('Failed to fetch any reference images from public folder');
      }
      
      console.log(`[CropEditor] Successfully fetched ${images.length}/${referenceConfigs.length} images, sending to edge function...`);
      
      const response = await supabase.functions.invoke('upload-crop-references', {
        body: { images }
      });
      
      console.log('[CropEditor] Edge function response:', response);
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      const uploaded = response.data?.uploaded || 0;
      const errors = response.data?.errors || [];
      
      if (errors.length > 0) {
        console.warn('[CropEditor] Upload had some errors:', errors);
      }
      
      toast({ 
        title: "Reference Images Uploaded", 
        description: `Successfully uploaded ${uploaded} reference images` 
      });
      
      console.log('[CropEditor] === UPLOAD COMPLETE ===');
      return true;
    } catch (error) {
      console.error('[CropEditor] === UPLOAD FAILED ===', error);
      toast({ 
        title: "Upload Failed", 
        description: error instanceof Error ? error.message : "Failed to upload reference images", 
        variant: "destructive" 
      });
      return false;
    } finally {
      setUploadingRefs(false);
    }
  };

  // Reset imageBoundsReady when switching images
  useEffect(() => {
    setImageBoundsReady(false);
  }, [selectedIndex]);

  // Polling fallback when generating - catches updates if realtime fails
  useEffect(() => {
    if (!generating || !runId) return;
    
    const interval = setInterval(() => {
      fetchJob();
      fetchImagesWithCrops();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [generating, runId]);

  // Apply crop coordinates ONLY after imageBounds is ready
  const applyCropFromDatabase = useCallback((crop: FaceCrop | undefined, bounds: typeof imageBounds) => {
    if (bounds.width === 0) return;
    
    if (crop) {
      // Convert from percentage (0-100) to pixel coordinates within imageBounds
      const pixelX = bounds.offsetX + (crop.crop_x / 100) * bounds.width;
      const pixelY = bounds.offsetY + (crop.crop_y / 100) * bounds.height;
      const pixelWidth = (crop.crop_width / 100) * bounds.width;
      const pixelHeight = (crop.crop_height / 100) * bounds.height;
      
      setCropRect({
        x: pixelX,
        y: pixelY,
        width: pixelWidth,
        height: pixelHeight,
      });
      setAspectRatio(crop.aspect_ratio as '1:1' | '4:5');
    } else {
      // Set default crop centered on image when no crop exists
      const aspectMultiplier = aspectRatio === '1:1' ? 1 : 1.25;
      const defaultWidth = bounds.width * 0.6;
      const defaultHeight = defaultWidth * aspectMultiplier;
      
      setCropRect({
        x: bounds.offsetX + (bounds.width - defaultWidth) / 2,
        y: bounds.offsetY + bounds.height * 0.1,
        width: defaultWidth,
        height: Math.min(defaultHeight, bounds.height * 0.8),
      });
    }
  }, [aspectRatio]);

  const fetchImagesWithCrops = async () => {
    if (!runId) return;
    setLoading(true);
    
    const { data: imagesData } = await supabase
      .from('face_scrape_images')
      .select('*')
      .eq('scrape_run_id', runId)
      .order('created_at', { ascending: true });

    if (!imagesData) {
      setLoading(false);
      return;
    }

    const imageIds = imagesData.map(img => img.id);
    
    const [cropsResult, detectionsResult] = await Promise.all([
      supabase.from('face_crops').select('*').in('scrape_image_id', imageIds),
      supabase.from('face_detections').select('*').in('scrape_image_id', imageIds)
    ]);

    const cropsMap = new Map((cropsResult.data || []).map(c => [c.scrape_image_id, c]));
    const detectionsMap = new Map((detectionsResult.data || []).map(d => [d.scrape_image_id, d]));

    const merged = imagesData.map(img => {
      const detection = detectionsMap.get(img.id);
      return {
        ...img,
        crop: cropsMap.get(img.id),
        noFaceDetected: detection?.status === 'no_face' || (detection?.face_count === 0),
      };
    }) as ImageWithCrop[];

    setImages(merged);
    setLoading(false);
  };

  const fetchJob = async () => {
    if (!runId) return;
    
    const { data } = await supabase
      .from('face_jobs')
      .select('*')
      .eq('scrape_run_id', runId)
      .eq('type', 'crop')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setJob(data as unknown as FaceJob);
      if (data.status === 'completed' || data.status === 'failed') {
        setGenerating(false);
      } else if (data.status === 'running' || data.status === 'pending') {
        setGenerating(true);
      }
    }
  };

  // Load image and detect face using MediaPipe
  const loadImageAndDetect = useCallback(async (imageUrl: string): Promise<{ imageWidth: number; imageHeight: number; faceBbox: any | null }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          const detections = await detectFaces(img);
          const faceBbox = getBestFaceDetection(detections);
          resolve({ 
            imageWidth: img.naturalWidth, 
            imageHeight: img.naturalHeight, 
            faceBbox 
          });
        } catch (error) {
          console.error('Face detection error:', error);
          resolve({ imageWidth: img.naturalWidth, imageHeight: img.naturalHeight, faceBbox: null });
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }, [detectFaces]);

  // Detect face for current selected image
  const handleDetectFace = async () => {
    if (!selectedImage || !detectorReady) return;
    
    setDetecting(true);
    try {
      const imageUrl = selectedImage.stored_url || selectedImage.source_url;
      const { imageWidth, imageHeight, faceBbox } = await loadImageAndDetect(imageUrl);
      
      // Calculate crop coordinates
      const cropCoords = calculateHeadAndShouldersCrop(faceBbox, imageWidth, imageHeight, aspectRatio);
      
      // Save detection result
      const existingDetection = await supabase
        .from('face_detections')
        .select('id')
        .eq('scrape_image_id', selectedImage.id)
        .single();
      
      if (existingDetection.data) {
        await supabase.from('face_detections').update({
          face_count: faceBbox ? 1 : 0,
          status: faceBbox ? 'detected' : 'no_face',
          bounding_boxes: faceBbox ? [faceBbox] : [],
        }).eq('id', existingDetection.data.id);
      } else {
        await supabase.from('face_detections').insert({
          scrape_image_id: selectedImage.id,
          face_count: faceBbox ? 1 : 0,
          status: faceBbox ? 'detected' : 'no_face',
          bounding_boxes: faceBbox ? [faceBbox] : [],
        });
      }
      
      // Save crop to database
      if (selectedImage.crop) {
        await supabase
          .from('face_crops')
          .update({
            crop_x: Math.round(cropCoords.x),
            crop_y: Math.round(cropCoords.y),
            crop_width: Math.round(cropCoords.width),
            crop_height: Math.round(cropCoords.height),
            aspect_ratio: aspectRatio,
            is_auto: true,
          })
          .eq('id', selectedImage.crop.id);
      } else {
        await supabase
          .from('face_crops')
          .insert({
            scrape_image_id: selectedImage.id,
            crop_x: Math.round(cropCoords.x),
            crop_y: Math.round(cropCoords.y),
            crop_width: Math.round(cropCoords.width),
            crop_height: Math.round(cropCoords.height),
            aspect_ratio: aspectRatio,
            is_auto: true,
          });
      }
      
      // Update cropRect immediately (convert percentages to pixels)
      if (imageBounds.width > 0) {
        setCropRect({
          x: imageBounds.offsetX + (cropCoords.x / 100) * imageBounds.width,
          y: imageBounds.offsetY + (cropCoords.y / 100) * imageBounds.height,
          width: (cropCoords.width / 100) * imageBounds.width,
          height: (cropCoords.height / 100) * imageBounds.height,
        });
      }
      
      toast({ 
        title: faceBbox ? "Face Detected" : "No Face Found", 
        description: faceBbox ? "Crop positioned around detected face" : "Using default crop - adjust manually if needed",
        variant: faceBbox ? "default" : "destructive"
      });
      fetchImagesWithCrops();
    } catch (error) {
      console.error('Error detecting face:', error);
      toast({ title: "Error", description: "Failed to detect face", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  // AI-based face detection using Gemini with reference images for few-shot learning
  const detectFaceWithAI = async (imageUrl: string): Promise<AIDetectionResult | null> => {
    try {
      // Get the base URL for reference images
      const baseUrl = window.location.origin;
      
      const response = await supabase.functions.invoke('detect-face-ai', {
        body: { 
          imageUrl, 
          aspectRatio,
          referenceImages: referenceImages.map(r => ({
            original_image_url: r.original_image_url,
            cropped_image_url: r.cropped_image_url,
            view_type: r.view_type
          })),
          baseUrl,
          // Pass recent corrections for dynamic learning
          corrections: recentCorrections.map(c => ({
            view_type: c.view_type,
            ai_crop: { x: c.ai_crop_x, y: c.ai_crop_y, width: c.ai_crop_width, height: c.ai_crop_height },
            user_crop: { x: c.user_crop_x, y: c.user_crop_y, width: c.user_crop_width, height: c.user_crop_height }
          }))
        }
      });
      
      if (response.error) {
        console.error('AI detection error:', response.error);
        return null;
      }
      
      return response.data as AIDetectionResult;
    } catch (error) {
      console.error('AI detection failed:', error);
      return null;
    }
  };

  // AI detect for current image
  const handleAIDetectFace = async () => {
    if (!selectedImage) return;
    
    setAiDetecting(true);
    try {
      // Auto-upload reference images if they don't have valid HTTPS URLs
      if (!hasValidReferenceUrls()) {
        console.log('[CropEditor] Reference images missing or invalid, uploading first...');
        toast({ title: "Setting up reference images...", description: "This may take a moment" });
        const uploadSuccess = await handleUploadReferenceImages();
        if (uploadSuccess) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for DB
          await fetchReferenceImages();
        }
        
        // Verify upload worked
        if (!hasValidReferenceUrls()) {
          toast({ 
            title: "Reference Upload Failed", 
            description: "Please try clicking 'Setup Refs' manually", 
            variant: "destructive" 
          });
          return;
        }
      }
      
      const imageUrl = selectedImage.stored_url || selectedImage.source_url;
      let result = await detectFaceWithAI(imageUrl);
      
      if (!result) {
        toast({ title: "Error", description: "AI detection failed", variant: "destructive" });
        return;
      }

      // CLIENT-SIDE VALIDATION: Enforce max 50% crop size
      if (result.suggestedCrop.width > 55 || result.suggestedCrop.height > 55) {
        console.warn(`[CropEditor] AI returned oversized crop (${result.suggestedCrop.width.toFixed(1)}% x ${result.suggestedCrop.height.toFixed(1)}%), reducing...`);
        
        const maxSize = 48;
        const centerX = result.suggestedCrop.x + result.suggestedCrop.width / 2;
        const centerY = result.suggestedCrop.y + result.suggestedCrop.height / 2;
        
        result = {
          ...result,
          suggestedCrop: {
            x: Math.max(0, Math.min(100 - maxSize, centerX - maxSize / 2)),
            y: Math.max(0, Math.min(100 - maxSize, centerY - maxSize / 2)),
            width: maxSize,
            height: maxSize
          }
        };
        
        toast({
          title: "Crop adjusted",
          description: "AI crop was too large, reduced for tighter framing"
        });
      }

      // Store the AI suggestion for potential learning (before any adjustments for display)
      setAiLastSuggestion({
        imageId: selectedImage.id,
        crop: { ...result.suggestedCrop }
      });

      const cropCoords = result.suggestedCrop;
      
      // Save detection result
      const existingDetection = await supabase
        .from('face_detections')
        .select('id')
        .eq('scrape_image_id', selectedImage.id)
        .single();
      
      const detectionData = {
        face_count: result.faceDetected ? 1 : 0,
        status: result.faceDetected ? 'detected' : (result.isBackView ? 'no_face' : 'no_face'),
        bounding_boxes: result.faceBoundingBox ? [result.faceBoundingBox] : [],
      };
      
      if (existingDetection.data) {
        await supabase.from('face_detections').update(detectionData).eq('id', existingDetection.data.id);
      } else {
        await supabase.from('face_detections').insert({ scrape_image_id: selectedImage.id, ...detectionData });
      }
      
      // Save crop to database
      if (selectedImage.crop) {
        await supabase
          .from('face_crops')
          .update({
            crop_x: Math.round(cropCoords.x),
            crop_y: Math.round(cropCoords.y),
            crop_width: Math.round(cropCoords.width),
            crop_height: Math.round(cropCoords.height),
            aspect_ratio: aspectRatio,
            is_auto: true,
          })
          .eq('id', selectedImage.crop.id);
      } else {
        await supabase
          .from('face_crops')
          .insert({
            scrape_image_id: selectedImage.id,
            crop_x: Math.round(cropCoords.x),
            crop_y: Math.round(cropCoords.y),
            crop_width: Math.round(cropCoords.width),
            crop_height: Math.round(cropCoords.height),
            aspect_ratio: aspectRatio,
            is_auto: true,
          });
      }
      
      // Update cropRect immediately
      if (imageBounds.width > 0) {
        setCropRect({
          x: imageBounds.offsetX + (cropCoords.x / 100) * imageBounds.width,
          y: imageBounds.offsetY + (cropCoords.y / 100) * imageBounds.height,
          width: (cropCoords.width / 100) * imageBounds.width,
          height: (cropCoords.height / 100) * imageBounds.height,
        });
      }
      
      const message = result.isBackView 
        ? "Back view detected - crop suggested for person's back"
        : result.faceDetected 
          ? "Face detected with AI - crop positioned"
          : "No face found - using suggested crop";
      
      toast({ 
        title: result.faceDetected ? "AI Detection Complete" : "No Face Found", 
        description: message,
        variant: result.faceDetected ? "default" : "destructive"
      });
      fetchImagesWithCrops();
    } catch (error) {
      console.error('Error with AI detection:', error);
      toast({ title: "Error", description: "AI detection failed", variant: "destructive" });
    } finally {
      setAiDetecting(false);
    }
  };

  // Batch auto-generate crops (MediaPipe or AI)
  const handleGenerateCrops = async () => {
    if (!runId || images.length === 0) return;
    if (!useAiDetection && !detectorReady) return;
    
    setGenerating(true);
    setBatchProgress({ current: 0, total: images.length, failed: 0 });
    let failedCount = 0;
    
    try {
      // Auto-upload reference images if using AI and they don't have valid URLs
      if (useAiDetection && !hasValidReferenceUrls()) {
        console.log('[CropEditor] Reference images missing or invalid, uploading first...');
        toast({ title: "Setting up reference images...", description: "This may take a moment" });
        const uploadSuccess = await handleUploadReferenceImages();
        if (uploadSuccess) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for DB
          await fetchReferenceImages();
        }
        
        // Verify upload worked
        if (!hasValidReferenceUrls()) {
          toast({ 
            title: "Reference Upload Failed", 
            description: "Please try clicking 'Setup Refs' manually", 
            variant: "destructive" 
          });
          setGenerating(false);
          return;
        }
      }
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        setBatchProgress({ current: i + 1, total: images.length, failed: failedCount });
        
        try {
          const imageUrl = image.stored_url || image.source_url;
          let cropCoords: { x: number; y: number; width: number; height: number };
          let faceDetected = false;
          let isBackView = false;
          
          if (useAiDetection) {
            // AI-based detection
            const result = await detectFaceWithAI(imageUrl);
            if (result) {
              cropCoords = result.suggestedCrop;
              faceDetected = result.faceDetected;
              isBackView = result.isBackView;
            } else {
              failedCount++;
              continue;
            }
            
            // Rate limiting - 200ms delay between AI calls
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            // MediaPipe-based detection
            const { imageWidth, imageHeight, faceBbox } = await loadImageAndDetect(imageUrl);
            cropCoords = calculateHeadAndShouldersCrop(faceBbox, imageWidth, imageHeight, aspectRatio);
            faceDetected = !!faceBbox;
          }
          
          // Save detection result
          const existingDetection = await supabase
            .from('face_detections')
            .select('id')
            .eq('scrape_image_id', image.id)
            .single();
          
          const detectionData = {
            face_count: faceDetected ? 1 : 0,
            status: faceDetected ? 'detected' : 'no_face',
            bounding_boxes: [],
          };
          
          if (existingDetection.data) {
            await supabase.from('face_detections').update(detectionData).eq('id', existingDetection.data.id);
          } else {
            await supabase.from('face_detections').insert({ scrape_image_id: image.id, ...detectionData });
          }
          
          // Upsert crop
          if (image.crop) {
            await supabase
              .from('face_crops')
              .update({
                crop_x: Math.round(cropCoords.x),
                crop_y: Math.round(cropCoords.y),
                crop_width: Math.round(cropCoords.width),
                crop_height: Math.round(cropCoords.height),
                aspect_ratio: aspectRatio,
                is_auto: true,
              })
              .eq('id', image.crop.id);
          } else {
            await supabase
              .from('face_crops')
              .insert({
                scrape_image_id: image.id,
                crop_x: Math.round(cropCoords.x),
                crop_y: Math.round(cropCoords.y),
                crop_width: Math.round(cropCoords.width),
                crop_height: Math.round(cropCoords.height),
                aspect_ratio: aspectRatio,
                is_auto: true,
              });
          }
        } catch (imgError) {
          console.error(`Error processing image ${image.id}:`, imgError);
          failedCount++;
        }
      }
      
      const method = useAiDetection ? 'AI' : 'MediaPipe';
      toast({ 
        title: "Complete", 
        description: `Generated ${images.length - failedCount} crops using ${method}${failedCount > 0 ? ` (${failedCount} failed)` : ''}` 
      });
      fetchImagesWithCrops();
    } catch (error) {
      console.error('Error generating crops:', error);
      toast({ title: "Error", description: "Failed to generate crops", variant: "destructive" });
    } finally {
      setGenerating(false);
      setBatchProgress({ current: 0, total: 0, failed: 0 });
    }
  };

  // Reset all crops for this run
  const handleResetAllCrops = async () => {
    if (!runId || images.length === 0) return;
    
    const confirmed = window.confirm(`Are you sure you want to delete all ${images.length} crops? This cannot be undone.`);
    if (!confirmed) return;
    
    setLoading(true);
    try {
      const imageIds = images.map(img => img.id);
      
      // Delete all crops for these images
      await supabase
        .from('face_crops')
        .delete()
        .in('scrape_image_id', imageIds);
      
      // Delete all detections for these images
      await supabase
        .from('face_detections')
        .delete()
        .in('scrape_image_id', imageIds);
      
      // Delete the old crop job so it doesn't show stale "completed" status
      await supabase
        .from('face_jobs')
        .delete()
        .eq('scrape_run_id', runId)
        .eq('type', 'crop');
      
      // Reset the progress bar and job state
      setBatchProgress({ current: 0, total: 0, failed: 0 });
      setJob(null);
      
      toast({ 
        title: "Crops Reset", 
        description: `Deleted crops for ${images.length} images` 
      });
      
      fetchImagesWithCrops();
    } catch (error) {
      console.error('Error resetting crops:', error);
      toast({ title: "Error", description: "Failed to reset crops", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCrop = async () => {
    if (!selectedImage || imageBounds.width === 0 || !runId) return;
    
    // Convert from pixel coordinates to percentage (0-100) relative to image bounds
    const cropXPercent = ((cropRect.x - imageBounds.offsetX) / imageBounds.width) * 100;
    const cropYPercent = ((cropRect.y - imageBounds.offsetY) / imageBounds.height) * 100;
    const cropWidthPercent = (cropRect.width / imageBounds.width) * 100;
    const cropHeightPercent = (cropRect.height / imageBounds.height) * 100;
    
    try {
      // Check if this is a correction of an AI suggestion (for learning)
      if (aiLastSuggestion && aiLastSuggestion.imageId === selectedImage.id) {
        const ai = aiLastSuggestion.crop;
        const hasSignificantDelta = 
          Math.abs(ai.x - cropXPercent) > 3 ||
          Math.abs(ai.y - cropYPercent) > 3 ||
          Math.abs(ai.width - cropWidthPercent) > 3 ||
          Math.abs(ai.height - cropHeightPercent) > 3;
        
        if (hasSignificantDelta) {
          // Get view type from identity images if available
          const { data: identityImage } = await supabase
            .from('face_identity_images')
            .select('view')
            .eq('scrape_image_id', selectedImage.id)
            .single();
          
          const viewType = identityImage?.view || 'front';
          
          // Save the correction for learning
          await supabase.from('crop_corrections').insert({
            scrape_image_id: selectedImage.id,
            scrape_run_id: runId,
            view_type: viewType,
            ai_crop_x: ai.x,
            ai_crop_y: ai.y,
            ai_crop_width: ai.width,
            ai_crop_height: ai.height,
            user_crop_x: cropXPercent,
            user_crop_y: cropYPercent,
            user_crop_width: cropWidthPercent,
            user_crop_height: cropHeightPercent
          });
          
          console.log(`[CropEditor] Saved correction: AI (${ai.width.toFixed(1)}%x${ai.height.toFixed(1)}%) -> User (${cropWidthPercent.toFixed(1)}%x${cropHeightPercent.toFixed(1)}%)`);
          
          // Refresh corrections list for future AI calls
          fetchRecentCorrections();
        }
        
        // Clear the AI suggestion after saving
        setAiLastSuggestion(null);
      }
      
      if (selectedImage.crop) {
        const { error } = await supabase
          .from('face_crops')
          .update({
            crop_x: Math.round(cropXPercent),
            crop_y: Math.round(cropYPercent),
            crop_width: Math.round(cropWidthPercent),
            crop_height: Math.round(cropHeightPercent),
            aspect_ratio: aspectRatio,
            is_auto: false,
          })
          .eq('id', selectedImage.crop.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('face_crops')
          .insert({
            scrape_image_id: selectedImage.id,
            crop_x: Math.round(cropXPercent),
            crop_y: Math.round(cropYPercent),
            crop_width: Math.round(cropWidthPercent),
            crop_height: Math.round(cropHeightPercent),
            aspect_ratio: aspectRatio,
            is_auto: false,
          });

        if (error) throw error;
      }

      // Capture scroll position before re-fetching
      const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      const scrollTop = scrollContainer?.scrollTop || 0;

      toast({ title: "Saved", description: "Crop saved" });
      await fetchImagesWithCrops();

      // Restore scroll position after re-fetch
      requestAnimationFrame(() => {
        const container = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (container) {
          container.scrollTop = scrollTop;
        }
      });
    } catch (error) {
      console.error('Error saving crop:', error);
      toast({ title: "Error", description: "Failed to save crop", variant: "destructive" });
    }
  };

  // Revert to last saved crop (doesn't re-detect)
  const handleRevertCrop = () => {
    if (selectedImage?.crop && imageBounds.width > 0) {
      applyCropFromDatabase(selectedImage.crop, imageBounds);
    }
  };

  // Delete a specific crop
  const handleDeleteCrop = async (imageId: string, cropId: string) => {
    try {
      // Capture scroll position before any updates
      const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      const scrollTop = scrollContainer?.scrollTop || 0;

      // OPTIMISTIC UPDATE: Filter out the image entirely from the list
      const deletedIndex = images.findIndex(img => img.id === imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
      
      // Adjust selectedIndex if needed
      if (deletedIndex !== -1) {
        setSelectedIndex(prev => {
          if (deletedIndex < prev) {
            return Math.max(0, prev - 1);
          } else if (deletedIndex === prev) {
            return Math.max(0, Math.min(prev, images.length - 2));
          }
          return prev;
        });
      }

      // Also clear aiLastSuggestion if it was for this image
      if (aiLastSuggestion?.imageId === imageId) {
        setAiLastSuggestion(null);
      }

      const { error } = await supabase
        .from('face_crops')
        .delete()
        .eq('id', cropId);

      if (error) {
        // ROLLBACK: If delete fails, re-fetch to restore correct state
        await fetchImagesWithCrops();
        throw error;
      }

      toast({ title: "Deleted", description: "Crop removed" });

      // Restore scroll position
      requestAnimationFrame(() => {
        const container = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (container) {
          container.scrollTop = scrollTop;
        }
      });
    } catch (error) {
      console.error('Error deleting crop:', error);
      toast({ title: "Error", description: "Failed to delete crop", variant: "destructive" });
    }
  };

  const getAspectMultiplier = () => aspectRatio === '1:1' ? 1 : 1.25;

  const handleCropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    setInteractionMode('move');
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartCrop({ ...cropRect });
  };

  const handleCornerMouseDown = (e: React.MouseEvent<HTMLDivElement>, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.stopPropagation();
    setInteractionMode(corner);
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartCrop({ ...cropRect });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (interactionMode === 'none') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const aspectMultiplier = getAspectMultiplier();
    const minSize = 30;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    if (interactionMode === 'move') {
      const newX = Math.max(0, Math.min(startCrop.x + deltaX, containerWidth - startCrop.width));
      const newY = Math.max(0, Math.min(startCrop.y + deltaY, containerHeight - startCrop.height));
      setCropRect(prev => ({ ...prev, x: newX, y: newY }));
    } else {
      let newX = startCrop.x;
      let newY = startCrop.y;
      let newWidth = startCrop.width;
      let newHeight = startCrop.height;

      if (interactionMode === 'se') {
        newWidth = Math.max(minSize, startCrop.width + deltaX);
        newHeight = newWidth * aspectMultiplier;
        if (newX + newWidth > containerWidth) {
          newWidth = containerWidth - newX;
          newHeight = newWidth * aspectMultiplier;
        }
        if (newY + newHeight > containerHeight) {
          newHeight = containerHeight - newY;
          newWidth = newHeight / aspectMultiplier;
        }
      } else if (interactionMode === 'sw') {
        newWidth = Math.max(minSize, startCrop.width - deltaX);
        newHeight = newWidth * aspectMultiplier;
        newX = startCrop.x + startCrop.width - newWidth;
        if (newX < 0) {
          newX = 0;
          newWidth = startCrop.x + startCrop.width;
          newHeight = newWidth * aspectMultiplier;
        }
        if (newY + newHeight > containerHeight) {
          newHeight = containerHeight - newY;
          newWidth = newHeight / aspectMultiplier;
          newX = startCrop.x + startCrop.width - newWidth;
        }
      } else if (interactionMode === 'ne') {
        newWidth = Math.max(minSize, startCrop.width + deltaX);
        newHeight = newWidth * aspectMultiplier;
        newY = startCrop.y + startCrop.height - newHeight;
        if (newX + newWidth > containerWidth) {
          newWidth = containerWidth - newX;
          newHeight = newWidth * aspectMultiplier;
          newY = startCrop.y + startCrop.height - newHeight;
        }
        if (newY < 0) {
          newY = 0;
          newHeight = startCrop.y + startCrop.height;
          newWidth = newHeight / aspectMultiplier;
        }
      } else if (interactionMode === 'nw') {
        newWidth = Math.max(minSize, startCrop.width - deltaX);
        newHeight = newWidth * aspectMultiplier;
        newX = startCrop.x + startCrop.width - newWidth;
        newY = startCrop.y + startCrop.height - newHeight;
        if (newX < 0) {
          newX = 0;
          newWidth = startCrop.x + startCrop.width;
          newHeight = newWidth * aspectMultiplier;
          newY = startCrop.y + startCrop.height - newHeight;
        }
        if (newY < 0) {
          newY = 0;
          newHeight = startCrop.y + startCrop.height;
          newWidth = newHeight / aspectMultiplier;
          newX = startCrop.x + startCrop.width - newWidth;
        }
      }

      setCropRect({ x: newX, y: newY, width: newWidth, height: newHeight });
    }
  };

  const handleMouseUp = () => {
    setInteractionMode('none');
  };

  // Handle image load - calculate bounds AND apply crop
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const container = editorContainerRef.current;
    if (!container) return;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    setContainerDimensions({ width: containerWidth, height: containerHeight });
    
    // Calculate actual rendered image bounds with object-contain
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const containerAspect = containerWidth / containerHeight;
    
    let renderedWidth, renderedHeight, offsetX, offsetY;
    
    if (imgAspect > containerAspect) {
      renderedWidth = containerWidth;
      renderedHeight = containerWidth / imgAspect;
      offsetX = 0;
      offsetY = (containerHeight - renderedHeight) / 2;
    } else {
      renderedHeight = containerHeight;
      renderedWidth = containerHeight * imgAspect;
      offsetX = (containerWidth - renderedWidth) / 2;
      offsetY = 0;
    }
    
    const newBounds = { offsetX, offsetY, width: renderedWidth, height: renderedHeight };
    setImageBounds(newBounds);
    setImageBoundsReady(true);
    
    // Apply crop from database NOW that bounds are ready
    applyCropFromDatabase(selectedImage?.crop, newBounds);
  };

  const croppedCount = images.filter(img => img.crop).length;
  const noFaceCount = images.filter(img => img.noFaceDetected).length;

  if (!runId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Select a scrape run from the Scrape tab to edit crops
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Crop Editor</h2>
          <Badge variant="outline">{croppedCount} / {images.length} cropped</Badge>
          {noFaceCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {noFaceCount} no face
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <RadioGroup 
            value={aspectRatio} 
            onValueChange={(v) => setAspectRatio(v as '1:1' | '4:5')}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="1:1" id="ratio-1-1" />
              <Label htmlFor="ratio-1-1">1:1</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="4:5" id="ratio-4-5" />
              <Label htmlFor="ratio-4-5">4:5</Label>
            </div>
          </RadioGroup>
          
          {/* AI Detection Toggle */}
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-muted/50">
            <Sparkles className={`h-4 w-4 ${useAiDetection ? 'text-primary' : 'text-muted-foreground'}`} />
            <Label htmlFor="use-ai" className="text-sm cursor-pointer">AI Detection</Label>
            <Switch
              id="use-ai"
              checked={useAiDetection}
              onCheckedChange={setUseAiDetection}
            />
            {useAiDetection && !hasValidReferenceUrls() && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleUploadReferenceImages()}
                disabled={uploadingRefs}
                className="ml-1 h-6 px-2 text-xs animate-pulse"
              >
                {uploadingRefs ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3 w-3 mr-1" />
                )}
                {uploadingRefs ? "Uploading..." : "Setup Refs (Required)"}
              </Button>
            )}
            {useAiDetection && hasValidReferenceUrls() && (
              <Badge variant="default" className="ml-1 text-xs bg-green-600">
                {referenceImages.length} refs ready
              </Badge>
            )}
            {useAiDetection && referenceImages.length > 0 && !hasValidReferenceUrls() && (
              <Badge variant="destructive" className="ml-1 text-xs">
                refs need upload
              </Badge>
            )}
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResetAllCrops}
            disabled={loading || generating || images.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Reset All
          </Button>
          <Button variant="outline" size="sm" onClick={fetchImagesWithCrops}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={handleGenerateCrops} 
            disabled={generating || images.length === 0 || (!useAiDetection && !detectorReady)}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 
                {batchProgress.current}/{batchProgress.total}
                {batchProgress.failed > 0 && <span className="text-red-300 ml-1">({batchProgress.failed} failed)</span>}
              </>
            ) : !useAiDetection && detectorLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading MediaPipe...</>
            ) : (
              <>
                {useAiDetection ? <Sparkles className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Auto-Generate Crops
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Batch progress indicator */}
      {generating && batchProgress.total > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {useAiDetection ? (
                    <Sparkles className="h-4 w-4 animate-pulse text-blue-500" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  )}
                  <span className="font-medium">
                    {useAiDetection ? 'AI Detecting Faces...' : 'Detecting Faces...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {batchProgress.failed > 0 && (
                    <Badge variant="destructive">{batchProgress.failed} failed</Badge>
                  )}
                  <Badge variant="default">
                    {batchProgress.current} / {batchProgress.total}
                  </Badge>
                </div>
              </div>
              <Progress value={(batchProgress.current / batchProgress.total) * 100} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job Status Bar */}
      {job && (
        <Card className={`border-l-4 ${
          job.status === 'running' ? 'border-l-blue-500' :
          job.status === 'completed' ? 'border-l-green-500' :
          job.status === 'failed' ? 'border-l-destructive' :
          'border-l-muted-foreground'
        }`}>
          <CardContent className="py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {job.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {job.status === 'completed' && <Check className="h-4 w-4 text-green-500" />}
                  {job.status === 'failed' && <span className="h-4 w-4 text-destructive">✕</span>}
                  {job.status === 'pending' && <span className="h-4 w-4 text-muted-foreground">⏳</span>}
                  <span className="font-medium">
                    {job.status === 'running' ? 'Generating Crops...' :
                     job.status === 'completed' ? 'Crop Generation Complete' :
                     job.status === 'failed' ? 'Crop Generation Failed' :
                     'Pending'}
                  </span>
                </div>
                <Badge variant={
                  job.status === 'running' ? 'default' :
                  job.status === 'completed' ? 'secondary' :
                  job.status === 'failed' ? 'destructive' :
                  'outline'
                }>
                  {job.progress} / {job.total}
                </Badge>
              </div>
              
              {(job.status === 'running' || job.status === 'completed') && (
                <Progress 
                  value={(job.progress / Math.max(job.total, 1)) * 100} 
                  className={job.status === 'completed' ? '[&>div]:bg-green-500' : ''}
                />
              )}
              
              {job.logs && job.logs.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {job.logs[job.logs.length - 1]?.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main editor */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Image list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Images</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]" ref={scrollAreaRef}>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      onClick={() => setSelectedIndex(index)}
                      className={`aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-colors group ${
                        selectedIndex === index 
                          ? 'border-primary' 
                          : 'border-transparent hover:border-muted-foreground/50'
                      }`}
                    >
                      <div className="relative w-full h-full">
                        <img
                          src={image.stored_url || image.source_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {image.crop && (
                          <div className="absolute top-1 right-1 flex items-center gap-0.5">
                            <Badge 
                              className={`text-[10px] px-1 ${
                                image.crop.is_auto ? 'bg-gray-400' : 'bg-green-500'
                              }`}
                              title={image.crop.is_auto ? 'AI-applied crop' : 'Manually applied crop'}
                            >
                              ✓
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCrop(image.id, image.crop!.id);
                              }}
                              className="bg-destructive/80 hover:bg-destructive text-destructive-foreground rounded p-0.5"
                              title="Delete crop"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {image.noFaceDetected && (
                          <Badge className="absolute top-1 left-1 text-[10px] px-1 bg-orange-500" title="No face detected - manual crop needed">
                            <AlertTriangle className="h-2.5 w-2.5" />
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Crop editor */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Original Image
              {selectedImage?.noFaceDetected && (
                <Badge variant="outline" className="text-orange-500 border-orange-500">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  No face - manual crop
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedImage ? (
              <div 
                ref={editorContainerRef}
                className="relative bg-muted rounded-lg overflow-hidden"
                style={{ aspectRatio: '3/4' }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  key={selectedImage.id}
                  src={selectedImage.stored_url || selectedImage.source_url}
                  alt=""
                  className="w-full h-full object-contain"
                  onLoad={handleImageLoad}
                />
                {/* Crop overlay with resize handles */}
                {imageBoundsReady && (
                  <div 
                    className="absolute border-2 border-primary bg-primary/20 cursor-move"
                    style={{
                      left: cropRect.x,
                      top: cropRect.y,
                      width: cropRect.width,
                      height: cropRect.height,
                    }}
                    onMouseDown={handleCropMouseDown}
                  >
                    {/* NW Corner */}
                    <div 
                      className="absolute w-3 h-3 bg-primary border border-background cursor-nw-resize rounded-sm"
                      style={{ top: -6, left: -6 }}
                      onMouseDown={(e) => handleCornerMouseDown(e, 'nw')}
                    />
                    {/* NE Corner */}
                    <div 
                      className="absolute w-3 h-3 bg-primary border border-background cursor-ne-resize rounded-sm"
                      style={{ top: -6, right: -6 }}
                      onMouseDown={(e) => handleCornerMouseDown(e, 'ne')}
                    />
                    {/* SW Corner */}
                    <div 
                      className="absolute w-3 h-3 bg-primary border border-background cursor-sw-resize rounded-sm"
                      style={{ bottom: -6, left: -6 }}
                      onMouseDown={(e) => handleCornerMouseDown(e, 'sw')}
                    />
                    {/* SE Corner */}
                    <div 
                      className="absolute w-3 h-3 bg-primary border border-background cursor-se-resize rounded-sm"
                      style={{ bottom: -6, right: -6 }}
                      onMouseDown={(e) => handleCornerMouseDown(e, 'se')}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                No image selected
              </div>
            )}
          </CardContent>
        </Card>

        {/* Crop preview and controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cropped Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedImage ? (
              <>
                <div 
                  className="bg-muted rounded-lg overflow-hidden relative"
                  style={{ aspectRatio: aspectRatio === '1:1' ? '1/1' : '4/5' }}
                >
                  {imageBoundsReady && cropRect.width > 0 ? (
                    <CropPreview
                      imageUrl={selectedImage.stored_url || selectedImage.source_url}
                      cropRect={cropRect}
                      imageBounds={imageBounds}
                      aspectRatio={aspectRatio}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      Loading preview...
                    </div>
                  )}
                </div>

                {/* Detection buttons - stacked vertically */}
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="default" 
                      onClick={handleAIDetectFace}
                      disabled={aiDetecting}
                      className="min-w-0 overflow-hidden"
                    >
                      {aiDetecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 flex-shrink-0 animate-spin" />
                          <span className="truncate">Detecting...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">AI Detect</span>
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleDetectFace}
                      disabled={detecting || !detectorReady}
                      className="min-w-0 overflow-hidden"
                    >
                      {detecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 flex-shrink-0 animate-spin" />
                          <span className="truncate">Detecting...</span>
                        </>
                      ) : detectorLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 flex-shrink-0 animate-spin" />
                          <span className="truncate">Loading...</span>
                        </>
                      ) : (
                        <>
                          <Scan className="h-4 w-4 mr-2 flex-shrink-0" />
                          <span className="truncate">Local Detect</span>
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleRevertCrop}
                      disabled={!selectedImage.crop}
                      className="min-w-0 overflow-hidden"
                    >
                      <RotateCcw className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">Revert</span>
                    </Button>
                    <Button 
                      onClick={handleSaveCrop}
                      className="min-w-0 overflow-hidden"
                    >
                      <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">Apply</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      disabled={selectedIndex === 0}
                      onClick={() => setSelectedIndex(i => i - 1)}
                      className="min-w-0 overflow-hidden"
                    >
                      <ChevronLeft className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">Previous</span>
                    </Button>
                    <Button
                      variant="outline"
                      disabled={selectedIndex === images.length - 1}
                      onClick={() => setSelectedIndex(i => i + 1)}
                      className="min-w-0 overflow-hidden"
                    >
                      <span className="truncate">Next</span>
                      <ChevronRight className="h-4 w-4 ml-2 flex-shrink-0" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Select an image to edit
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Separate component for crop preview with cleaner calculation
function CropPreview({ 
  imageUrl, 
  cropRect, 
  imageBounds, 
  aspectRatio 
}: { 
  imageUrl: string; 
  cropRect: { x: number; y: number; width: number; height: number }; 
  imageBounds: { offsetX: number; offsetY: number; width: number; height: number };
  aspectRatio: '1:1' | '4:5';
}) {
  // Convert crop from container space to image-relative percentages
  const cropXInImage = cropRect.x - imageBounds.offsetX;
  const cropYInImage = cropRect.y - imageBounds.offsetY;
  
  const cropXPercent = (cropXInImage / imageBounds.width) * 100;
  const cropYPercent = (cropYInImage / imageBounds.height) * 100;
  const cropWidthPercent = (cropRect.width / imageBounds.width) * 100;
  const cropHeightPercent = (cropRect.height / imageBounds.height) * 100;
  
  // Calculate scale to fill the preview container
  const scale = 100 / cropWidthPercent;
  
  return (
    <div className="w-full h-full overflow-hidden relative">
      <img
        src={imageUrl}
        alt=""
        className="absolute"
        style={{
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          left: `${-cropXPercent * scale}%`,
          top: `${-cropYPercent * scale}%`,
          width: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
