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
