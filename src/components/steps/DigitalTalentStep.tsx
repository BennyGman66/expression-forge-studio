import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button, Flex, Text, Heading, TextField, Card, Box, IconButton, Dialog } from "@radix-ui/themes";
import { Plus, Users, Trash2, Edit2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DigitalModel, DigitalModelRef } from "@/types";

interface DigitalTalentStepProps {
  models: DigitalModel[];
  modelRefs: Record<string, DigitalModelRef[]>;
  projectId: string;
  onCreateModel: (name: string) => void;
  onDeleteModel: (id: string) => void;
  onRenameModel: (id: string, name: string) => void;
  onAddRefs: (modelId: string, urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (refId: string) => void;
}

export function DigitalTalentStep({
  models,
  modelRefs,
  projectId,
  onCreateModel,
  onDeleteModel,
  onRenameModel,
  onAddRefs,
  onRemoveRef,
}: DigitalTalentStepProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    models.length > 0 ? models[0].id : null
  );

  const handleCreate = () => {
    if (newModelName.trim()) {
      onCreateModel(newModelName.trim());
      setNewModelName('');
      setIsCreating(false);
    }
  };

  const handleRename = (id: string) => {
    if (editName.trim()) {
      onRenameModel(id, editName.trim());
      setEditingId(null);
    }
  };

  const selectedModel = models.find(m => m.id === selectedModelId);
  const selectedRefs = selectedModelId ? (modelRefs[selectedModelId] || []) : [];

  return (
    <Card className="animate-fade-in" size="3">
      <Flex align="center" gap="4" mb="4">
        <div className="step-indicator active">
          <Users className="w-4 h-4" />
        </div>
        <Box className="flex-1">
          <Heading size="5">Digital Talent Packs</Heading>
          <Text size="2" color="gray" className="mt-1">
            Create up to 4 digital model packs with reference images
          </Text>
        </Box>
        <Dialog.Root open={isCreating} onOpenChange={setIsCreating}>
          <Dialog.Trigger>
            <Button disabled={models.length >= 4}>
              <Plus className="w-4 h-4" />
              Add Model
            </Button>
          </Dialog.Trigger>
          <Dialog.Content style={{ maxWidth: 400 }}>
            <Dialog.Title>Create Digital Model</Dialog.Title>
            <Flex direction="column" gap="4" pt="4">
              <TextField.Root
                placeholder="Model name (e.g., 'Alex', 'Model A')"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Flex justify="end" gap="2">
                <Button variant="soft" color="gray" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newModelName.trim()}>
                  Create
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>

      {models.length === 0 ? (
        <Flex 
          direction="column" 
          align="center" 
          py="8" 
          className="border border-dashed border-border rounded-lg"
        >
          <Users className="w-12 h-12 mb-4 text-muted-foreground" />
          <Text color="gray">
            Create your first digital model to upload reference images
          </Text>
        </Flex>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Model List */}
          <Flex direction="column" gap="3">
            <Text size="2" color="gray">
              {models.length}/4 models
            </Text>
            {models.map((model) => {
              const refs = modelRefs[model.id] || [];
              const isEditing = editingId === model.id;
              
              return (
                <Card
                  key={model.id}
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedModelId === model.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => !isEditing && setSelectedModelId(model.id)}
                >
                  <Flex align="center" gap="3" p="3">
                    <Box className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                      {refs.length > 0 ? (
                        <img 
                          src={refs[0].image_url} 
                          alt={model.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Flex align="center" justify="center" className="w-full h-full">
                          <Users className="w-5 h-5 text-muted-foreground" />
                        </Flex>
                      )}
                    </Box>
                    
                    <Box className="flex-1 min-w-0">
                      {isEditing ? (
                        <Flex align="center" gap="2">
                          <TextField.Root
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            size="1"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(model.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <IconButton 
                            size="1" 
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleRename(model.id); }}
                          >
                            <Check className="w-4 h-4" />
                          </IconButton>
                          <IconButton 
                            size="1" 
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          >
                            <X className="w-4 h-4" />
                          </IconButton>
                        </Flex>
                      ) : (
                        <>
                          <Text weight="medium" className="block truncate">{model.name}</Text>
                          <Text size="1" color="gray">
                            {refs.length} reference{refs.length !== 1 ? 's' : ''}
                          </Text>
                        </>
                      )}
                    </Box>
                    
                    {!isEditing && (
                      <Flex gap="1">
                        <IconButton
                          size="1"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditName(model.name);
                            setEditingId(model.id);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </IconButton>
                        <IconButton
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteModel(model.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </Flex>
                    )}
                  </Flex>
                </Card>
              );
            })}
          </Flex>

          {/* Selected Model References */}
          <Card variant="surface" className="lg:col-span-2 p-4">
            {selectedModel ? (
              <Flex direction="column" gap="4">
                <Heading size="4">{selectedModel.name} References</Heading>
                
                <ImageUploader
                  onUpload={(urls) => onAddRefs(selectedModel.id, urls)}
                  folder={`projects/${projectId}/models/${selectedModel.id}`}
                  className="!p-4"
                />
                
                {selectedRefs.length > 0 && (
                  <div className="image-grid">
                    {selectedRefs.map((ref) => (
                      <ImageThumbnail
                        key={ref.id}
                        src={ref.image_url}
                        alt={ref.file_name || undefined}
                        onRemove={() => onRemoveRef(ref.id)}
                      />
                    ))}
                  </div>
                )}
              </Flex>
            ) : (
              <Flex align="center" justify="center" className="h-full min-h-[200px]">
                <Text color="gray">Select a model to manage references</Text>
              </Flex>
            )}
          </Card>
        </div>
      )}
    </Card>
  );
}
