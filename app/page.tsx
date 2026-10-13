import { BackendStatus } from "@/components/BackendStatus";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

// Scaffold shell only. Login, navigation and the connection indicator arrive in Stage 8.
export default function Home() {
  return (
    <>
      <header className="bg-midnight text-cream">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-3">
          <Logo variant="reversed" className="h-10 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Zuscar</h1>
        <p className="mt-2 max-w-prose">Project scaffold. The point-of-sale screens are built in later stages.</p>
        <div className="mt-4"><BackendStatus /></div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          <li className="rounded-lg border border-stone-brand border-l-8 border-l-ember bg-white p-4"><strong>Restaurant</strong><br />Ember accent</li>
          <li className="rounded-lg border border-stone-brand border-l-8 border-l-saffron bg-white p-4"><strong>Bar and club</strong><br />Saffron accent</li>
          <li className="rounded-lg border border-stone-brand border-l-8 border-l-teal-brand bg-white p-4"><strong>Rooms</strong><br />Teal accent</li>
        </ul>
      </main>
    </>
  );
}
