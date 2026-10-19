// Print documents and jobs as the API returns them (Stage 14). Pure types and helpers: nothing here touches the page.

export type DocType = "receipt" | "kitchen_ticket" | "bill" | "test_page";
export type JobStatus = "queued" | "printed" | "failed" | "reprinted";

export const DOC_LABEL: Record<DocType, string> = { receipt: "Receipt", kitchen_ticket: "Kitchen ticket", bill: "Bill", test_page: "Test page" };
export const JOB_STATUS_LABEL: Record<JobStatus, string> = { queued: "Waiting to print", printed: "Printed", failed: "Did not print", reprinted: "Copy printed" };

export type Business = { name: string; address: string; phone: string; footer: string; timezone: string };

export type DocLine = {
  qty: number;
  name: string;
  modifiers?: string;
  unit_price_cents: number;
  modifiers_cents: number;
  discount_cents: number;
  discount_reason?: string;
  line_total_cents: number;
};

export type ReceiptDoc = {
  type: "receipt";
  business: Business;
  sale_id: number;
  receipt_no: number;
  order_no?: number;
  business_date: string;
  created_at: string;
  cashier_name: string;
  lines: DocLine[];
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  tax_inclusive: boolean;
  tax_status: "provisional_unverified" | "verified";
  payments: { method: string; status: string; amount_cents: number; reference?: string }[];
  paid_cents: number;
  pending_cents: number;
  balance_cents: number;
  payment_status: string;
  sale_status: string;
};

export type TicketDoc = {
  type: "kitchen_ticket";
  business_name: string;
  ticket_id: number;
  ticket_no: number;
  kind: "original" | "update";
  order_no: number;
  order_type: "dine_in" | "takeaway";
  table_label: string;
  business_date: string;
  created_at: string;
  created_by: string;
  timezone: string;
  lines: { qty: number; name: string; change_type: "add" | "cancel" | "modify"; modifiers?: string; note?: string }[];
};

export type BillDoc = {
  type: "bill";
  business: Business;
  order_id: number;
  order_no: number;
  generated_at: string;
  lines: DocLine[];
  total_cents: number;
  tax_cents: number;
  tax_inclusive: boolean;
  tax_status: "provisional_unverified" | "verified";
};

export type TestDoc = { type: "test_page"; business: Business; generated_at: string; paper_mm: number; print_mm: number };

export type PrintDocument = ReceiptDoc | TicketDoc | BillDoc | TestDoc;

export type PrintJob = {
  id: number;
  doc_type: DocType;
  sale_id: number | null;
  ticket_id: number | null;
  order_id: number | null;
  status: JobStatus;
  reprint_of: number | null;
  copy_no: number;
  is_reprint: boolean;
  created_by: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  document?: PrintDocument;
  attempts?: { id: number; outcome: "printed" | "failed"; note?: string; created_by_name: string; created_at: string }[];
};

/** The text that marks a copy. A reprint must be obvious at a glance on paper (AC-03), so it is one banner with the copy number. */
export function reprintBanner(job: Pick<PrintJob, "is_reprint" | "copy_no">): string | null {
  return job.is_reprint ? `REPRINT · COPY ${job.copy_no}` : null;
}

export const RECEIPT_LOGO = { src: "/brand/zuscar-receipt-logo.png", width: 384, height: 109 } as const;

/** Date and time in the business's own time zone, so a receipt reads the same wherever it is printed. */
export function stamp(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-KE", { timeZone, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

/** What each document type needs to be printed again, matching the API (sales.reprint for receipts). */
export function reprintPermission(docType: DocType): string | null {
  switch (docType) {
    case "receipt":
      return "sales.reprint";
    case "kitchen_ticket":
      return "kitchen.view";
    case "bill":
      return "sales.create";
    default:
      return null;
  }
}
