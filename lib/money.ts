// Money is whole cents everywhere. Nothing here uses floating point to convert text to cents.
const MAX_CENTS = 100_000_000; // KES 1,000,000, the same guard the API applies

/** 85000 -> "KES 850.00". */
export function formatKes(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}KES ${Math.floor(a / 100).toLocaleString("en-KE")}.${String(a % 100).padStart(2, "0")}`;
}

/** 85000 -> "850.00", for filling a text box. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** "850", "850.5", "1,250.00" -> cents. Returns null for anything else (letters, three decimals, out of range). */
export function parseKes(text: string, opts: { allowNegative?: boolean } = {}): number | null {
  let t = text.trim().replaceAll(",", "").replaceAll(" ", "");
  let negative = false;
  if (t.startsWith("-")) {
    if (!opts.allowNegative) return null;
    negative = true;
    t = t.slice(1);
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return negative && cents !== 0 ? -cents : cents;
}
