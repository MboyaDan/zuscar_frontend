// The shape the reports API returns (Stage 25). Every report is a list of tables, so one page can show all of them.

import { formatDay } from "@/lib/format";
import { formatKes } from "@/lib/money";

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

export type ReportChoice = { name: string; label: string; ranged: boolean; single?: boolean; own?: boolean; description: string };

/** One table cell as text, by the kind of its column. */
export function formatCell(col: ReportColumn, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (col.kind === "money" && typeof v === "number") return formatKes(v);
  if (col.kind === "bp" && typeof v === "number") return `${(v / 100).toFixed(1)}%`;
  if (col.kind === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDay(v);
  return String(v);
}

export const REPORTS: ReportChoice[] = [
  { name: "sales", label: "Sales", ranged: true, own: true, description: "What was sold, by day, by restaurant and bar, and the best sellers." },
  { name: "collections", label: "Collections", ranged: true, own: true, description: "Money actually received, by day and method, and money paid back." },
  { name: "balances-due", label: "Balances due", ranged: false, description: "Who owes money right now: unpaid sales and guest bills." },
  { name: "discounts-voids-refunds", label: "Discounts, voids and refunds", ranged: true, description: "Each one, with the reason and who approved it." },
  { name: "stock", label: "Stock", ranged: false, description: "What is in stock now and what is running low." },
  { name: "rooms", label: "Rooms", ranged: true, description: "Rooms sold each night, occupancy and room revenue." },
  { name: "expenses-profit", label: "Expenses and profit", ranged: true, description: "Sales before tax, less stock received and expenses. An estimate: it counts stock that arrived, not stock sold." },
  { name: "day-close", label: "End-of-day closing summary", ranged: false, single: true, description: "One day on one sheet: sales, cash, M-Pesa, card, discounts, voids, shifts, expenses and rooms. Print it at closing." },
];

/** Print the report sheet on A4. Receipts print on 80 mm paper, so the page size is switched for this one print only. */
export function printSheet(): void {
  const style = document.createElement("style");
  style.textContent = "@page { size: A4; margin: 12mm; }";
  document.head.appendChild(style);
  const done = () => {
    style.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
