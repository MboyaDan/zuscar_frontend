import { formatKes } from "@/lib/money";
import type { CashMovement, Shift } from "@/lib/types";

export const SHIFT_STATUS_LABEL: Record<Shift["status"], string> = { open: "Open", closed: "Closed, not yet checked", reconciled: "Checked by a manager" };

export const MOVEMENT_LABEL: Record<CashMovement["kind"], string> = { paid_in: "Cash put in", paid_out: "Cash taken out", expense: "Expense paid from the till" };

/** variance = declared - expected, so a negative number means the drawer is short. */
export function varianceText(cents: number): string {
  if (cents === 0) return "Balanced: counted cash matches what was expected";
  return cents < 0 ? `Short by ${formatKes(-cents)}` : `Over by ${formatKes(cents)}`;
}
