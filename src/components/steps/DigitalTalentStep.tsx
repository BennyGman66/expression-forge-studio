import { useState } from "react";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
    <div className="workflow-step animate-fade-in">
      <div className="workflow-step-header">
        <div className="step-indicator active">
          <Users className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Digital Talent Packs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create up to 4 digital model packs with reference images
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button variant="glow" disabled={models.length >= 4}>
              <Plus className="w-4 h-4" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Digital Model</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="Model name (e.g., 'Alex', 'Model A')"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newModelName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {models.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-border rounded-lg">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            Create your first digital model to upload reference images
          </p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Model List */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {models.length}/4 models
            </h3>
            {models.map((model) => {
              const refs = modelRefs[model.id] || [];
              const isEditing = editingId === model.id;
              
              return (
                <div
                  key={model.id}
                  className={cn(
                    "model-card cursor-pointer",
                    selectedModelId === model.id && "border-primary bg-primary/5"
                  )}
                  onClick={() => !isEditing && setSelectedModelId(model.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                      {refs.length > 0 ? (
                        <img 
                          src={refs[0].image_url} 
                          alt={model.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Users className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(model.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); handleRename(model.id); }}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium truncate">{model.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {refs.length} reference{refs.length !== 1 ? 's' : ''}
                          </p>
                        </>
                      )}
                    </div>
                    
                    {!isEditing && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditName(model.name);
                            setEditingId(model.id);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteModel(model.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Model References */}
          <div className="lg:col-span-2 border border-border rounded-lg p-4 bg-muted/10">
            {selectedModel ? (
              <div className="space-y-4">
                <h3 className="font-medium">{selectedModel.name} References</h3>
                
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
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                Select a model to manage references
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
