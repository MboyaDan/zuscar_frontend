// The expenses ledger (Stage 26). Amounts are whole cents, like everywhere else.

export type Expense = {
  id: number;
  expense_date: string;
  description: string;
  category: string;
  amount_cents: number;
  paid_by: string;
  paid_with: string;
  entered_by: string;
  entered_at: string;
  voided: boolean;
  void_reason: string | null;
};

export type ExpenseList = { expenses: Expense[]; more: boolean; categories: string[]; methods: string[] };

export const CATEGORY_LABELS: Record<string, string> = {
  rent: "Rent",
  utilities: "Power, water, internet",
  wages: "Wages",
  transport: "Transport",
  repairs: "Repairs and maintenance",
  supplies: "Cleaning and other supplies",
  licences: "Licences and fees",
  marketing: "Marketing",
  other: "Other",
};

export const METHOD_LABELS: Record<string, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", card: "Card", other: "Other" };

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m;
