import { LayoutDashboard, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown only to users who hold this permission. The API enforces it regardless of what is shown here. */
  permission?: string;
  description: string;
};

// Each stage adds its screens here. A screen appears only when its page exists.
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Your account and what you can do." },
];
