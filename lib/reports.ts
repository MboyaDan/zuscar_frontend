// The shape the reports API returns (Stage 25). Every report is a list of tables, so one page can show all of them.

export type ReportColumn = { key: string; label: string; kind: "text" | "date" | "int" | "money" | "bp" };

export type ReportSection = {
  key: string;
  title: string;
  columns: ReportColumn[];
  rows: (string | number | null)[][] | null;
  totals?: (string | number | null)[];
};

export type Report = {
  name: string;
  title: string;
  from?: string;
  to?: string;
  timezone: string;
  notes: string[] | null;
  sections: ReportSection[];
};

export type ReportChoice = { name: string; label: string; ranged: boolean; own?: boolean; description: string };

export const REPORTS: ReportChoice[] = [
  { name: "sales", label: "Sales", ranged: true, own: true, description: "What was sold, by day, by restaurant and bar, and the best sellers." },
  { name: "collections", label: "Collections", ranged: true, own: true, description: "Money actually received, by day and method, and money paid back." },
  { name: "balances-due", label: "Balances due", ranged: false, description: "Who owes money right now: unpaid sales and guest bills." },
  { name: "discounts-voids-refunds", label: "Discounts, voids and refunds", ranged: true, description: "Each one, with the reason and who approved it." },
  { name: "stock", label: "Stock", ranged: false, description: "What is in stock now and what is running low." },
  { name: "rooms", label: "Rooms", ranged: true, description: "Rooms sold each night, occupancy and room revenue." },
];
