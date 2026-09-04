import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Input, type InputProps } from "./input";

/**
 * The header search from the sheet: pill-shaped, magnifier at the inline-start
 * edge, optional trailing slot (the mockup puts a barcode scanner there).
 */
export function SearchInput({ className, endIcon, ...props }: InputProps) {
  return (
    <Input
      type="search"
      startIcon={<Search className="size-4.5" />}
      endIcon={endIcon}
      className={cn("rounded-lg bg-surface", className)}
      {...props}
    />
  );
}
