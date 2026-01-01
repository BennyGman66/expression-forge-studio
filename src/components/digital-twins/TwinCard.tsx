import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { User, Image } from "lucide-react";
import { DigitalTwinWithBrand } from "@/types/digital-twin";
import { cn } from "@/lib/utils";

interface TwinCardProps {
  twin: DigitalTwinWithBrand;
  isSelected?: boolean;
  onClick?: () => void;
}

export function TwinCard({ twin, isSelected, onClick }: TwinCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      {/* Image */}
      <div className="aspect-square bg-muted relative">
        {twin.representative_image_url ? (
          <img
            src={twin.representative_image_url}
            alt={twin.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <h3 className="font-medium truncate">{twin.name}</h3>
        
        <div className="flex flex-wrap gap-1">
          {twin.gender && (
            <Badge variant="secondary" className="text-xs capitalize">
              {twin.gender}
            </Badge>
          )}
          {twin.brand && (
            <Badge variant="outline" className="text-xs">
              {twin.brand.name}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Image className="h-3 w-3" />
            {twin.image_count} images
          </span>
          {twin.usage_count > 0 && (
            <span>{twin.usage_count} uses</span>
          )}
        </div>
      </div>
    </Card>
  );
}
