import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Grid3X3, Users, ExternalLink, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const generalApps = [
  {
    id: "expression-map",
    title: "Expression Map",
    description: "Extract and generate expression recipes at scale.",
    icon: Grid3X3,
    path: "/expression-map",
  },
  {
    id: "digital-talent",
    title: "Digital Talent",
    description: "Manage digital talent identities and track their usage.",
    icon: User,
    path: "/digital-talent",
  },
  {
    id: "external",
    title: "External",
    description: "Share curated selections with clients for review.",
    icon: ExternalLink,
    path: "/external",
  },
];

const avatarToPdpApps = [
  {
    id: "talent-face-library",
    title: "Talent Face Library",
    description: "Build reference face datasets per digital talent.",
    icon: Grid3X3,
    path: "/face-creator",
    stepNumber: 1,
  },
  {
    id: "face-application",
    title: "Face Application",
    description: "Apply digital talent faces to look imagery.",
    icon: Users,
    path: "/face-application",
    stepNumber: 2,
  },
  {
    id: "avatar-repose",
    title: "Avatar Repose",
    description: "Ingest open poses, generate clay poses, transfer to digital talent.",
    icon: Users,
    path: "/avatar-repose",
    stepNumber: 3,
  },
];

export default function Hub() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("general");

  const handleAppClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />

      <main className="px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="avatar-to-pdp">Avatar to PDP</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {generalApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleAppClick(app.path)}
                  className="app-card text-left"
                >
                  <h3 className="app-card-title">{app.title}</h3>
                  <p className="app-card-description">{app.description}</p>
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="avatar-to-pdp">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {avatarToPdpApps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleAppClick(app.path)}
                  className="app-card text-left relative"
                >
                  <div className="absolute top-4 left-4 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xl font-serif font-medium text-primary">
                      {app.stepNumber}
                    </span>
                  </div>
                  <div className="pt-12">
                    <h3 className="app-card-title">{app.title}</h3>
                    <p className="app-card-description">{app.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
