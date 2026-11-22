import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

type NativeSelectProps = Omit<React.ComponentProps<"select">, "name"> & {
  name: string;
  label?: string;
  options: Option[];
  placeholder?: string;
  errors?: string[];
  hint?: string;
};

/** Accessible native <select> (works in server actions / FormData and on every mobile). */
export function NativeSelect({
  name,
  label,
  options,
  placeholder,
  errors,
  hint,
  className,
  id,
  ...props
}: NativeSelectProps) {
  const fieldId = id ?? `field-${name}`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      {label ? <Label htmlFor={fieldId}>{label}</Label> : null}
      <div className="relative">
        <select
          id={fieldId}
          name={name}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? `${fieldId}-error` : undefined}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive bg-card h-11 w-full appearance-none rounded-[10px] border px-3 pr-9 text-sm shadow-xs outline-none focus-visible:ring-3 disabled:opacity-50"
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
          aria-hidden
        />
      </div>
      {hint && !errors?.length ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {errors?.length ? (
        <p id={`${fieldId}-error`} className="text-destructive text-sm" role="alert">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
