import { useState } from "react";
import { Button, Dialog, Flex, Text, Heading, TextField, TextArea, Card, IconButton, Box } from "@radix-ui/themes";
import { 
  FolderPlus, 
  FolderOpen, 
  Sparkles, 
  ArrowRight,
  Trash2,
  Calendar,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { DEFAULT_MASTER_PROMPT } from "@/lib/constants";
import { format } from "date-fns";

interface ProjectSelectorProps {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (project: Project) => void;
  onCreate: (name: string, masterPrompt: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectSelector({ 
  projects, 
  isOpen, 
  onClose, 
  onSelect, 
  onCreate,
  onDelete 
}: ProjectSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [masterPrompt, setMasterPrompt] = useState(DEFAULT_MASTER_PROMPT);

  const handleCreate = () => {
    if (newName.trim()) {
      onCreate(newName.trim(), masterPrompt);
      setNewName('');
      setMasterPrompt(DEFAULT_MASTER_PROMPT);
      setIsCreating(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Content style={{ maxWidth: 650 }} className="max-h-[85vh] overflow-hidden">
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Sparkles className="w-5 h-5 text-primary" />
            Expression Map Factory
          </Flex>
        </Dialog.Title>

        <Box className="overflow-y-auto py-4" style={{ maxHeight: 'calc(85vh - 120px)' }}>
          {!isCreating ? (
            <Flex direction="column" gap="4">
              <Button 
                variant="outline" 
                size="3"
                className="w-full h-20 border-dashed border-2"
                onClick={() => setIsCreating(true)}
              >
                <FolderPlus className="w-6 h-6 mr-3" />
                Create New Project
              </Button>

              {projects.length > 0 && (
                <Flex direction="column" gap="2">
                  <Text size="2" color="gray" className="px-1">
                    Recent Projects
                  </Text>
                  {projects.map((project) => (
                    <Card
                      key={project.id}
                      className={cn(
                        "group cursor-pointer transition-all hover:border-primary/50"
                      )}
                      onClick={() => onSelect(project)}
                    >
                      <Flex align="center" gap="4" p="3">
                        <Flex 
                          align="center" 
                          justify="center" 
                          className="w-12 h-12 rounded-lg bg-primary/10"
                        >
                          <FolderOpen className="w-6 h-6 text-primary" />
                        </Flex>
                        <Box className="flex-1 min-w-0">
                          <Text weight="medium" className="block truncate">
                            {project.name}
                          </Text>
                          <Text size="1" color="gray">
                            <Flex align="center" gap="1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(project.created_at), 'MMM d, yyyy')}
                            </Flex>
                          </Text>
                        </Box>
                        <IconButton
                          variant="ghost"
                          color="red"
                          className="opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(project.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}

              {projects.length === 0 && (
                <Flex direction="column" align="center" py="8" className="text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mb-3 opacity-50" />
                  <Text>No projects yet. Create your first one!</Text>
                </Flex>
              )}
            </Flex>
          ) : (
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="medium">Project Name</Text>
                <TextField.Root
                  placeholder="My Expression Map Project"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1.5"
                  autoFocus
                />
              </Box>
              
              <Box>
                <Text as="label" size="2" weight="medium">Master Prompt Template</Text>
                <Text size="1" color="gray" className="block mt-0.5 mb-1.5">
                  This will be the base for all generated prompts. Expression recipes will be appended.
                </Text>
                <TextArea
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
              </Box>

              <Flex gap="2">
                <Button variant="soft" color="gray" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!newName.trim()}>
                  Create Project
                </Button>
              </Flex>
            </Flex>
          )}
        </Box>
      </Dialog.Content>
    </Dialog.Root>
  );
}
