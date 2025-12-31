import { useBrands, Brand } from "@/hooks/useBrands";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface BrandSelectorProps {
  value?: string;
  onValueChange: (brandId: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function BrandSelector({
  value,
  onValueChange,
  placeholder = "Select brand",
  className,
  disabled,
}: BrandSelectorProps) {
  const { brands, loading } = useBrands();

  if (loading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {brands.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No brands available. Add brands in Digital Talent.
          </div>
        ) : (
          brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

interface MultiBrandSelectorProps {
  selectedIds: string[];
  onSelectionChange: (brandIds: string[]) => void;
  className?: string;
}

export function MultiBrandSelector({
  selectedIds,
  onSelectionChange,
  className,
}: MultiBrandSelectorProps) {
  const { brands, loading } = useBrands();

  if (loading) {
    return <Skeleton className="h-10 w-full" />;
  }

  const toggleBrand = (brandId: string) => {
    if (selectedIds.includes(brandId)) {
      onSelectionChange(selectedIds.filter((id) => id !== brandId));
    } else {
      onSelectionChange([...selectedIds, brandId]);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {brands.map((brand) => (
        <button
          key={brand.id}
          onClick={() => toggleBrand(brand.id)}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            selectedIds.includes(brand.id)
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {brand.name}
        </button>
      ))}
      {brands.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No brands available. Add brands in Digital Talent.
        </p>
      )}
    </div>
  );
}

export { type Brand };
