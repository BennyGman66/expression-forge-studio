import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageUploader, ImageThumbnail } from "@/components/ImageUploader";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import type { DigitalModel, DigitalModelRef } from "@/types";

interface TalentPanelProps {
  models: DigitalModel[];
  modelRefs: Record<string, DigitalModelRef[]>;
  projectId: string;
  onCreateModel: (name: string) => void;
  onDeleteModel: (id: string) => void;
  onRenameModel: (id: string, name: string) => void;
  onAddRefs: (modelId: string, urls: { url: string; fileName: string }[]) => void;
  onRemoveRef: (modelId: string, refId: string) => void;
}

export function TalentPanel({
  models,
  modelRefs,
  projectId,
  onCreateModel,
  onDeleteModel,
  onRenameModel,
  onAddRefs,
  onRemoveRef,
}: TalentPanelProps) {
  const [newModelName, setNewModelName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const handleCreate = () => {
    if (newModelName.trim()) {
      onCreateModel(newModelName.trim());
      setNewModelName("");
      setShowCreateDialog(false);
    }
  };

  const startEditing = (model: DigitalModel) => {
    setEditingId(model.id);
    setEditingName(model.name);
  };

  const saveEditing = () => {
    if (editingId && editingName.trim()) {
      onRenameModel(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Digital Talent</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create digital models and upload reference images for each
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Model
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">Add Digital Model</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input
                placeholder="Model name"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
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
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            No digital models yet. Add your first one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Model List */}
          <div className="space-y-3">
            {models.map((model) => {
              const refs = modelRefs[model.id] || [];
              const isEditing = editingId === model.id;
              const isSelected = selectedModelId === model.id;

              return (
                <div
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  className={`panel cursor-pointer transition-all ${
                    isSelected ? "ring-1 ring-primary" : "hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                      {refs.length > 0 ? (
                        <img
                          src={refs[0].image_url}
                          alt={model.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              saveEditing();
                            }}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium truncate">{model.name}</p>
                          <p className="text-sm text-muted-foreground">{refs.length} refs</p>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditing(model);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
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

          {/* Model References */}
          {selectedModel && (
            <div className="panel">
              <div className="panel-header">
                <h3 className="font-medium">{selectedModel.name} - References</h3>
              </div>
              <div className="panel-body space-y-4">
                <ImageUploader
                  onUpload={(urls) => onAddRefs(selectedModel.id, urls)}
                  folder={`projects/${projectId}/models/${selectedModel.id}`}
                />
                <div className="grid grid-cols-3 gap-2">
                  {(modelRefs[selectedModel.id] || []).map((ref) => (
                    <ImageThumbnail
                      key={ref.id}
                      src={ref.image_url}
                      alt={ref.file_name || undefined}
                      onRemove={() => onRemoveRef(selectedModel.id, ref.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
