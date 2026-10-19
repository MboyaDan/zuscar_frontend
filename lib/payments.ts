import type { PaymentMethod, PaymentStatus, SaleRow } from "@/lib/types";

export const METHODS: { value: PaymentMethod; label: string; needsReference: boolean }[] = [
  { value: "cash", label: "Cash", needsReference: false },
  { value: "mpesa_manual", label: "M-Pesa", needsReference: true },
  { value: "card_manual", label: "Card", needsReference: true },
  { value: "bank_manual", label: "Bank transfer", needsReference: true },
];

export const methodLabel = (m: string) => METHODS.find((x) => x.value === m)?.label ?? m;

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending_confirmation: "Waiting for confirmation",
  confirmed: "Confirmed",
  failed: "Failed",
  reversed: "Reversed",
};

export const SALE_PAYMENT_LABEL: Record<SaleRow["payment_status"], string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  charged_to_folio: "Charged to room",
};

export const SALE_STATUS_LABEL: Record<SaleRow["status"], string> = {
  finalised: "Final",
  partially_refunded: "Part refunded",
  refunded: "Refunded",
  voided: "Voided",
};
