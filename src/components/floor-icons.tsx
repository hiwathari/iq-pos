"use client";

import { createContext, useContext } from "react";
import { CategoryIconView } from "@/components/category-icon";

// Each floor's chosen icon, by floor name — provided once per page (Manage Table, the Till) so every
// floor tab can show it without passing it through every component in between.
const FloorIconsContext = createContext<Record<string, string>>({});

export function FloorIconsProvider({ icons, children }: { icons: Record<string, string>; children: React.ReactNode }) {
  return <FloorIconsContext.Provider value={icons}>{children}</FloorIconsContext.Provider>;
}

// A floor's name with its icon in front (just the name when it has none).
export function FloorLabel({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const icon = useContext(FloorIconsContext)[name];
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && <CategoryIconView icon={icon} className={`${className} shrink-0`} />}
      {name}
    </span>
  );
}

export function useFloorIcons() {
  return useContext(FloorIconsContext);
}
