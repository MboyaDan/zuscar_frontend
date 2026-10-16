import { LayoutDashboard, ScrollText, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";

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
  { href: "/users", label: "Users", icon: Users, permission: "users.update", description: "Add people, set their roles, reset passwords and deactivate accounts." },
  { href: "/roles", label: "Roles", icon: ShieldCheck, permission: "roles.manage", description: "Create roles and choose what each role is allowed to do." },
  { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view", description: "Who did what, and when, for sensitive changes." },
  { href: "/settings", label: "Settings", icon: Settings, permission: "system.admin", description: "Business settings and the tax configuration check before go-live." },
];
