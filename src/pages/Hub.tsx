import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Grid3X3, Users, ExternalLink } from "lucide-react";

const apps = [
  {
    id: "expression-map",
    title: "Expression Map",
    description: "Extract and generate expression recipes at scale.",
    icon: Grid3X3,
    path: "/expression-map",
    disabled: false,
  },
  {
    id: "avatar-repose",
    title: "Avatar Repose",
    description: "Scrape brands, generate clay poses, transfer to digital talent.",
    icon: Users,
    path: "/avatar-repose",
    disabled: false,
  },
  {
    id: "external",
    title: "External",
    description: "Share curated selections with clients for review.",
    icon: ExternalLink,
    path: "/external",
    disabled: false,
  },
  {
    id: "face-creator",
    title: "Face Creator",
    description: "Scrape & segment model faces for reference datasets.",
    icon: Grid3X3,
    path: "/face-creator",
    disabled: false,
  },
];

export default function Hub() {
  const navigate = useNavigate();

  const handleAppClick = (app: typeof apps[0]) => {
    if (app.path && !app.disabled) {
      navigate(app.path);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <HubHeader />

      <main className="px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => handleAppClick(app)}
              disabled={app.disabled}
              className={`app-card text-left ${app.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <h3 className="app-card-title">{app.title}</h3>
              <p className="app-card-description">{app.description}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
