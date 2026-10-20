const stamp = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" });

/** A date and time in the browser's time zone, or a dash when there is none. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : stamp.format(d);
}

export function roleLabel(code: string, names?: Map<string, string>): string {
  return names?.get(code) ?? code.replaceAll("_", " ");
}

/** A random temporary password: 16 characters, no look-alike letters, never typed or stored by the app. */
export function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const dayStamp = new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short" });

/** "2026-10-24" -> "Sat 24 Oct". A booking date has no time and no zone, so it is read as written. */
export function formatDay(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  return m ? dayStamp.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : "—";
}

/** Today's date in the browser's time zone as YYYY-MM-DD; the API checks the business date itself. */
export function todayYmd(plusDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole nights between two YYYY-MM-DD dates; 0 when either is missing or the order is wrong. */
export function nightsBetween(from: string, to: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!a || !b) return 0;
  const days = (Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))) / 86_400_000;
  return days > 0 ? Math.round(days) : 0;
}
