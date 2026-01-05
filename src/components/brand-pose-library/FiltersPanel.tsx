import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CoverageStats, 
  PoseFilters, 
  Gender, 
  CurationStatus,
  OutputShotType,
  ALL_OUTPUT_SHOT_TYPES,
  OUTPUT_SHOT_LABELS,
} from "@/hooks/useLibraryPoses";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

interface FiltersPanelProps {
  filters: PoseFilters;
  onFiltersChange: (filters: PoseFilters) => void;
  coverage: CoverageStats;
  minPosesPerSlot: number;
  totalPoses: number;
}

const GENDERS: { value: Gender | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
];
const STATUSES: { value: CurationStatus | "all"; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All", icon: null },
  { value: "pending", label: "Pending", icon: <Clock className="w-3 h-3" /> },
  { value: "included", label: "Included", icon: <CheckCircle2 className="w-3 h-3" /> },
  { value: "excluded", label: "Excluded", icon: <XCircle className="w-3 h-3" /> },
  { value: "failed", label: "Failed", icon: <AlertTriangle className="w-3 h-3" /> },
];

// Short labels for tab triggers
const SHORT_LABELS: Record<OutputShotType, string> = {
  FRONT_FULL: 'Front',
  FRONT_CROPPED: 'Crop',
  DETAIL: 'Detail',
  BACK_FULL: 'Back',
};

export function FiltersPanel({
  filters,
  onFiltersChange,
  coverage,
  minPosesPerSlot,
  totalPoses,
}: FiltersPanelProps) {
  const getShotTypeCount = (shotType: OutputShotType) => {
    let count = 0;
    (["women", "men"] as Gender[]).forEach((g) => {
      count += coverage[g][shotType].included + coverage[g][shotType].pending + coverage[g][shotType].excluded + coverage[g][shotType].failed;
    });
    return count;
  };

  const getIncludedCount = (gender: Gender, shotType: OutputShotType) => coverage[gender][shotType].included;
  const meetsMinimum = (gender: Gender, shotType: OutputShotType) => getIncludedCount(gender, shotType) >= minPosesPerSlot;

  return (
    <div className="w-60 flex-shrink-0 border-r bg-muted/30 p-4 space-y-4 overflow-y-auto">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Total Poses</p>
        <p className="text-2xl font-bold">{totalPoses}</p>
      </div>

      <Separator />

      {/* Shot Type Filter */}
      <div>
        <p className="text-sm font-medium mb-2">Shot Type</p>
        <Tabs
          value={filters.shotType}
          onValueChange={(v) => onFiltersChange({ ...filters, shotType: v as OutputShotType | "all" })}
        >
          <TabsList className="grid grid-cols-5 h-8">
            <TabsTrigger value="all" className="text-xs px-1">All</TabsTrigger>
            {ALL_OUTPUT_SHOT_TYPES.map((shotType) => (
              <TabsTrigger key={shotType} value={shotType} className="text-xs px-1" title={OUTPUT_SHOT_LABELS[shotType]}>
                {SHORT_LABELS[shotType]}
                <span className="ml-0.5 text-muted-foreground text-[10px]">({getShotTypeCount(shotType)})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Gender Filter */}
      <div>
        <p className="text-sm font-medium mb-2">Gender</p>
        <div className="flex gap-1">
          {GENDERS.map((g) => (
            <Button
              key={g.value}
              size="sm"
              variant={filters.gender === g.value ? "default" : "outline"}
              className="flex-1 text-xs"
              onClick={() => onFiltersChange({ ...filters, gender: g.value })}
            >
              {g.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Status Filter */}
      <div>
        <p className="text-sm font-medium mb-2">Status</p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={filters.status === s.value ? "default" : "outline"}
              className="text-xs flex items-center gap-1"
              onClick={() => onFiltersChange({ ...filters, status: s.value })}
            >
              {s.icon}
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Coverage Stats */}
      <Card>
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm">Coverage</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          {(["women", "men"] as Gender[]).map((gender) => (
            <div key={gender}>
              <p className="text-xs font-medium mb-1 capitalize">{gender}</p>
              <div className="grid grid-cols-4 gap-1">
                {ALL_OUTPUT_SHOT_TYPES.map((shotType) => {
                  const count = getIncludedCount(gender, shotType);
                  const ok = meetsMinimum(gender, shotType);
                  return (
                    <div
                      key={shotType}
                      className={`text-center p-1 rounded text-xs ${
                        ok ? "bg-green-500/20 text-green-700" : "bg-amber-500/20 text-amber-700"
                      }`}
                      title={OUTPUT_SHOT_LABELS[shotType]}
                    >
                      <div className="font-medium">{SHORT_LABELS[shotType]}</div>
                      <div>{count}/{minPosesPerSlot}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
