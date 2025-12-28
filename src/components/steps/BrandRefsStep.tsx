import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button, Flex, Text, Heading, Card, Box, Badge } from "@radix-ui/themes";
import { Trash2, Image as ImageIcon } from "lucide-react";
import type { BrandRef } from "@/types";

interface BrandRefsStepProps {
  brandRefs: BrandRef[];
  onAddRefs: (urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (id: string) => void;
  onClearAll: () => void;
  projectId: string;
}

export function BrandRefsStep({ 
  brandRefs, 
  onAddRefs, 
  onRemoveRef, 
  onClearAll,
  projectId 
}: BrandRefsStepProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = brandRefs.find(ref => ref.id === selectedId);

  return (
    <Card className="animate-fade-in" size="3">
      <Flex align="center" gap="4" mb="4">
        <div className="step-indicator active">
          <ImageIcon className="w-4 h-4" />
        </div>
        <Box className="flex-1">
          <Heading size="5">Brand Reference Images</Heading>
          <Text size="2" color="gray" className="mt-1">
            Upload 10–15+ reference images from your brand photography to extract expression recipes
          </Text>
        </Box>
        {brandRefs.length > 0 && (
          <Button variant="soft" color="gray" onClick={onClearAll}>
            <Trash2 className="w-4 h-4" />
            Clear All
          </Button>
        )}
      </Flex>

      <ImageUploader 
        onUpload={onAddRefs} 
        folder={`projects/${projectId}/brand-refs`}
        className="mb-6"
      />

      {brandRefs.length > 0 && (
        <Flex direction="column" gap="4">
          <Flex align="center" justify="between">
            <Text size="2" color="gray">
              <Badge color="lime" variant="soft" mr="2">{brandRefs.length}</Badge>
              image{brandRefs.length !== 1 ? 's' : ''} uploaded
            </Text>
          </Flex>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {brandRefs.map((ref) => (
              <ImageThumbnail
                key={ref.id}
                src={ref.image_url}
                alt={ref.file_name || undefined}
                selected={ref.id === selectedId}
                onClick={() => setSelectedId(ref.id === selectedId ? null : ref.id)}
                onRemove={() => onRemoveRef(ref.id)}
              />
            ))}
          </div>
        </Flex>
      )}

      {selectedRef && (
        <Card className="mt-6" variant="surface">
          <Flex gap="4" p="3">
            <img 
              src={selectedRef.image_url} 
              alt={selectedRef.file_name || "Selected"} 
              className="w-32 h-32 object-cover rounded-lg"
            />
            <Box>
              <Text weight="medium">{selectedRef.file_name || 'Image'}</Text>
              <Text size="2" color="gray" className="mt-1">
                Click "Extract Recipes" to analyze this and other images
              </Text>
            </Box>
          </Flex>
        </Card>
      )}
    </Card>
  );
}
