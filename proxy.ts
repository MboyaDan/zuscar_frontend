import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A convenience for people: someone with no session cookie goes straight to the sign-in page instead of seeing an
// empty screen first. It does not decide access; the API validates the session and permissions on every request.
export function proxy(request: NextRequest) {
  if (request.cookies.has("zuscar_session")) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in page, the help pages, the API and static assets.
  matcher: ["/((?!api|_next|login|help|icon.svg|apple-icon.png|favicon.ico).*)"],
};
