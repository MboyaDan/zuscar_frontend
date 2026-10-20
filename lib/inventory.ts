import type { InventoryItem, MovementType } from "@/lib/types";

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening_balance: "Opening stock",
  receipt: "Received",
  transfer_out: "Moved out",
  transfer_in: "Moved in",
  sale_consumption: "Sold",
  sale_return: "Put back after a sale",
  recipe_consumption: "Used in a recipe",
  wastage: "Wastage",
  breakage: "Breakage",
  complimentary: "Complimentary",
  count_adjustment: "Stock count change",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

/** Movements the server lets a person reverse here. Sales are put right by a void or refund, transfers by a new transfer. */
export const REVERSIBLE: MovementType[] = ["opening_balance", "receipt", "wastage", "breakage", "complimentary", "count_adjustment", "adjustment"];

/** "1,425 ml", with a leading + or - for a change. */
export function qtyText(n: number, unit: string, signed = false): string {
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-KE")} ${unit}`;
}

/** The units a person may type a quantity in: the base unit, then each unit the item has a conversion for. */
export function unitChoices(item: InventoryItem): { id: number; label: string }[] {
  return [
    { id: item.base_unit.id, label: item.base_unit.name },
    ...item.conversions.map((c) => ({ id: c.from_unit_id, label: `${c.from_unit_name} (${c.factor_num}${c.factor_den !== 1 ? `/${c.factor_den}` : ""} ${item.base_unit.code})` })),
  ];
}

export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (!/^-?\d{1,10}$/.test(t)) return null;
  return Number(t);
}
