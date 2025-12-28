import { useNavigate } from "react-router-dom";
import { HubHeader } from "@/components/layout/HubHeader";
import { Grid3X3, Film, MapPin, Users } from "lucide-react";

const apps = [
  {
    id: "internal",
    title: "Internal",
    description: "Leapfrog internal tooling",
    icon: Grid3X3,
    path: null, // Not implemented yet
    disabled: true,
  },
  {
    id: "expression-map",
    title: "Expression Map",
    description: "Extract and generate expression recipes at scale.",
    icon: Grid3X3,
    path: "/expression-map",
    disabled: false,
  },
  {
    id: "image2video",
    title: "Image2Video",
    description: "Create videos from images at scale.",
    icon: Film,
    path: null,
    disabled: true,
  },
  {
    id: "studio-to-setting",
    title: "Studio to Setting",
    description: "Place talent at location without the travel.",
    icon: MapPin,
    path: null,
    disabled: true,
  },
  {
    id: "talent-replacement",
    title: "Talent Replacement",
    description: "Create PDP using digital talent.",
    icon: Users,
    path: null,
    disabled: true,
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
