import type { NextConfig } from "next";

// ADR-05: the browser only ever talks to THIS origin; /api/* is forwarded to the Go backend.
// Because calls are same-origin there is no CORS and cookies stay first-party.
// BACKEND_URL is server-side only (no NEXT_PUBLIC_ prefix) and is read at BUILD time:
// the rewrite target is baked into the build, so change it in Vercel and redeploy.
const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");

if (!backendUrl && process.env.NODE_ENV === "production") {
  throw new Error("BACKEND_URL must be set when building for production (for example https://your-api.onrender.com).");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const target = backendUrl ?? "http://localhost:8080";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
