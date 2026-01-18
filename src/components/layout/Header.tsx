import { Sparkles, FolderOpen } from "lucide-react";
import { Button, Flex, Text, Heading, Badge } from "@radix-ui/themes";

interface HeaderProps {
  projectName?: string;
  onOpenProjects?: () => void;
  title?: string;
}

export function Header({ projectName, onOpenProjects, title = "Expression Map Factory" }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <Flex className="h-full px-6" align="center" justify="between">
        <Flex align="center" gap="3">
          <Flex 
            align="center" 
            justify="center" 
            className="w-10 h-10 rounded-xl gradient-primary"
          >
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </Flex>
          <Flex direction="column" gap="0">
            <Heading size="4" weight="bold" className="tracking-tight">
              {title}
            </Heading>
            {projectName && (
              <Text size="1" color="gray">
                {projectName}
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex align="center" gap="3">
          {onOpenProjects && (
            <Button variant="soft" onClick={onOpenProjects}>
              <FolderOpen className="w-4 h-4" />
              Projects
            </Button>
          )}
        </Flex>
      </Flex>
    </header>
  );
}
