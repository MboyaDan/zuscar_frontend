import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Connection lost" };

// Kept outside the signed-in area on purpose: when the connection is down you may not be able to sign in.
export default function OutagePage() {
  return (
    <main id="main" className="mx-auto max-w-prose px-6 py-10">
      <Logo variant="horizontal" className="mb-8 h-12 w-auto" />
      <h1 className="text-3xl font-semibold">Connection lost</h1>
      <p className="mt-4">The app cannot reach the server right now. This page opens when the connection indicator shows <strong>Offline</strong>.</p>
      <ul className="mt-4 list-disc space-y-2 pl-6">
        <li>Check the internet connection of this device and try again.</li>
        <li>Do not enter the same action twice while you wait. Screens that save data will tell you when a save did not go through.</li>
        <li>Tell your manager that the system is offline.</li>
      </ul>
      <p className="mt-4">The written step-by-step outage procedure for taking orders and payments by hand has <strong>not been written yet</strong>. It is planned for the go-live preparation. Until then, follow your manager&apos;s instructions.</p>
      <p className="mt-6"><Link href="/dashboard" className="text-teal-brand underline">Try again</Link></p>
    </main>
  );
}
