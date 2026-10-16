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
  // Everything except the sign-in page, the help pages, the API and static assets. /brand/ must be listed: the logo
  // is shown on the sign-in page, before any session cookie exists, and a redirect there turns the image into a broken icon.
  matcher: ["/((?!api|_next|brand/|login|help|icon.svg|apple-icon.png|favicon.ico).*)"],
};
