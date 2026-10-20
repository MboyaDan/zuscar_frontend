import { Banknote, BedDouble, Boxes, Truck, ChefHat, FilePenLine, Printer, BadgeCheck, ClipboardList, LayoutDashboard, ReceiptText, Receipt, ScrollText, Settings, ShieldCheck, UtensilsCrossed, Users, type LucideIcon } from "lucide-react";

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
  { href: "/pos", label: "Sell", icon: ReceiptText, permission: "orders.manage", description: "Tables and orders: add items, send to the kitchen." },
  { href: "/kitchen", label: "Kitchen", icon: ChefHat, permission: "kitchen.view", description: "Tickets sent from orders: start, mark ready, mark served." },
  { href: "/print", label: "Printing", icon: Printer, description: "Receipts, tickets and bills you printed: try a failed one again, print a copy, or print a test page." },
  { href: "/sales", label: "Sales", icon: Receipt, permission: "sales.view", description: "Finished sales, what is paid and what is still owed." },
  { href: "/outage", label: "Outage entries", icon: FilePenLine, permission: "payments.reconcile", description: "Enter paper receipts written while the system was down. Each paper receipt can be entered once." },
  { href: "/inventory", label: "Stock", icon: Boxes, permission: "inventory.view", description: "What is in stock at each place, opening stock, adjustments and every movement." },
  { href: "/purchases", label: "Deliveries", icon: Truck, permission: "purchasing.manage", description: "Suppliers and the stock they deliver: write a delivery down, then receive it into a place with its cost." },
  { href: "/rooms", label: "Rooms", icon: BedDouble, permission: "rooms.manage", description: "Bookings, free rooms for given nights, guests, and the rooms and their rates." },
  { href: "/shift", label: "My shift", icon: Banknote, permission: "shifts.manage", description: "Open your till shift, record cash in and out, count the drawer and close." },
  { href: "/shifts", label: "Shifts", icon: ClipboardList, permission: "shifts.close", description: "Past and open shifts, with any cash difference, ready to be checked." },
  { href: "/payments", label: "Payments", icon: BadgeCheck, permission: "payments.reconcile", description: "M-Pesa, card and bank payments waiting for you to confirm." },
  { href: "/users", label: "Users", icon: Users, permission: "users.update", description: "Add people, set their roles, reset passwords and deactivate accounts." },
  { href: "/catalogue", label: "Catalogue", icon: UtensilsCrossed, permission: "catalogue.manage", description: "Categories, products, prices, availability and modifiers." },
  { href: "/roles", label: "Roles", icon: ShieldCheck, permission: "roles.manage", description: "Create roles and choose what each role is allowed to do." },
  { href: "/audit", label: "Audit log", icon: ScrollText, permission: "audit.view", description: "Who did what, and when, for sensitive changes." },
  { href: "/settings", label: "Settings", icon: Settings, permission: "system.admin", description: "Business settings and the tax configuration check before go-live." },
];
