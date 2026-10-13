import { z } from "zod";

// Public settings only. Secrets and the backend URL never go through this file.
const publicEnv = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = publicEnv.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || undefined,
});
