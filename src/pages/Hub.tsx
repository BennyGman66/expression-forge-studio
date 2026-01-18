import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { 
  Grid3X3, 
  User, 
  Briefcase, 
  Shield, 
  Users, 
  ExternalLink,
  Eye,
  Workflow
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const internalApps = [
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
    id: "brand-pose-library",
    title: "Pose Library",
    description: "Generate clay poses and curate a reusable library.",
    icon: Grid3X3,
    path: "/brand-pose-library",
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
    id: "repose-production",
    title: "Repose Production",
    description: "Apply brand clay pose libraries to approved job outputs.",
    icon: Users,
    path: "/repose-production",
    stepNumber: 3,
  },
  {
    id: "optimised-workflow",
    title: "Optimised Workflow",
    description: "Unified single-page production dashboard with stage tracking.",
    icon: Workflow,
    path: "/optimised-workflow",
    stepNumber: 4,
  },
];

const freelanceApps = [
  {
    id: "jobs",
    title: "Job Board",
    description: "Manage external jobs and freelancer assignments.",
    icon: Briefcase,
    path: "/jobs",
  },
];

const clientApps = [
  {
    id: "external",
    title: "External Reviews",
    description: "Share curated selections with clients for review.",
    icon: ExternalLink,
    path: "/external",
  },
];

const adminApps = [
  {
    id: "users",
    title: "User Management",
    description: "Manage users and their roles.",
    icon: Shield,
    path: "/users",
  },
];

export default function Hub() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("internal");

  const handleAppClick = (path: string) => {
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />

      <main className="px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="internal">Leapfrog Internal</TabsTrigger>
            <TabsTrigger value="freelance">Editors</TabsTrigger>
            <TabsTrigger value="client">Client</TabsTrigger>
            {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
          </TabsList>

          {/* Leapfrog Internal Tab */}
          <TabsContent value="internal">
            <div className="space-y-8">
              {/* Production Tools */}
              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Production Tools</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {internalApps.map((app) => (
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
              </section>

              {/* Avatar to PDP Workflow */}
              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Avatar to PDP</h2>
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
              </section>

            </div>
          </TabsContent>

          {/* Freelance Tab */}
          <TabsContent value="freelance">
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Job Management</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {freelanceApps.map((app) => (
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
              </section>

              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Portal Preview</h2>
                <Button
                  variant="outline"
                  onClick={() => handleAppClick("/work")}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview Freelancer Portal
                </Button>
              </section>
            </div>
          </TabsContent>

          {/* Client Tab */}
          <TabsContent value="client">
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Client Reviews</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {clientApps.map((app) => (
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
              </section>

              <section>
                <h2 className="text-lg font-medium text-foreground mb-4">Portal Preview</h2>
                <Button
                  variant="outline"
                  onClick={() => handleAppClick("/client")}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview Client Portal
                </Button>
              </section>
            </div>
          </TabsContent>

          {/* Admin Tab */}
          {isAdmin && (
            <TabsContent value="admin">
              <div className="space-y-8">
                <section>
                  <h2 className="text-lg font-medium text-foreground mb-4">Administration</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {adminApps.map((app) => (
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
                </section>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
