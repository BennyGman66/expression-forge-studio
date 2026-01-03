import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoverageStats, PoseFilters, Slot, Gender, CurationStatus } from "@/hooks/useLibraryPoses";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

interface FiltersPanelProps {
  filters: PoseFilters;
  onFiltersChange: (filters: PoseFilters) => void;
  coverage: CoverageStats;
  minPosesPerSlot: number;
  totalPoses: number;
}

const SLOTS: Slot[] = ["A", "B", "C", "D"];
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

export function FiltersPanel({
  filters,
  onFiltersChange,
  coverage,
  minPosesPerSlot,
  totalPoses,
}: FiltersPanelProps) {
  const getSlotCount = (slot: Slot) => {
    let count = 0;
    (["women", "men"] as Gender[]).forEach((g) => {
      count += coverage[g][slot].included + coverage[g][slot].pending + coverage[g][slot].excluded + coverage[g][slot].failed;
    });
    return count;
  };

  const getIncludedCount = (gender: Gender, slot: Slot) => coverage[gender][slot].included;
  const meetsMinimum = (gender: Gender, slot: Slot) => getIncludedCount(gender, slot) >= minPosesPerSlot;

  return (
    <div className="w-60 flex-shrink-0 border-r bg-muted/30 p-4 space-y-4 overflow-y-auto">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Total Poses</p>
        <p className="text-2xl font-bold">{totalPoses}</p>
      </div>

      <Separator />

      {/* Slot Filter */}
      <div>
        <p className="text-sm font-medium mb-2">Slot</p>
        <Tabs
          value={filters.slot}
          onValueChange={(v) => onFiltersChange({ ...filters, slot: v as Slot | "all" })}
        >
          <TabsList className="grid grid-cols-5 h-8">
            <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
            {SLOTS.map((slot) => (
              <TabsTrigger key={slot} value={slot} className="text-xs px-2">
                {slot}
                <span className="ml-1 text-muted-foreground">({getSlotCount(slot)})</span>
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
                {SLOTS.map((slot) => {
                  const count = getIncludedCount(gender, slot);
                  const ok = meetsMinimum(gender, slot);
                  return (
                    <div
                      key={slot}
                      className={`text-center p-1 rounded text-xs ${
                        ok ? "bg-green-500/20 text-green-700" : "bg-amber-500/20 text-amber-700"
                      }`}
                    >
                      <div className="font-medium">{slot}</div>
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
