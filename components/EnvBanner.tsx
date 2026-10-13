import { FlaskConical } from "lucide-react";
import { env } from "@/lib/env";

// Visible whenever the app is not production (prompt section 8). Icon plus text, never colour alone.
export function EnvBanner() {
  const appEnv = env.NEXT_PUBLIC_APP_ENV;
  if (appEnv === "production") return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-saffron px-4 py-2 text-sm font-medium text-midnight">
      <FlaskConical aria-hidden className="size-4" />
      <span>Test environment: data here is fake and may be wiped ({appEnv})</span>
    </div>
  );
}
