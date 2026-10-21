// Small in-memory helpers that make opening an order feel instant on a slow link (Stage 26 follow-up).
//
// - The menu is fetched ahead of time (as soon as the tables screen opens) and kept for the life of the page. It is
//   only used to paint the order screen straight away: the screen still fetches a fresh copy, and the server decides
//   every price and every availability when an item is added, so a stale menu can never change what is charged.
// - The order the server returned when it was created is handed to the order screen, so it does not wait for a second
//   fetch of the same order.
// Both are forgotten on sign-in and sign-out, because what a person may see depends on who they are.
import { api } from "@/lib/api";
import type { MenuCategory, Order } from "@/lib/types";

let menu: MenuCategory[] | null = null;
let inFlight: Promise<MenuCategory[]> | null = null;
let handoff: Order | null = null;

export function peekMenu(): MenuCategory[] | null {
  return menu;
}

/** Fetches the menu once at a time and remembers it. */
export function fetchMenu(): Promise<MenuCategory[]> {
  if (!inFlight) {
    inFlight = api<{ categories: MenuCategory[] }>("/menu")
      .then((r) => {
        menu = r.categories;
        return r.categories;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Start loading the menu in the background; a failure is ignored here and shows up when the order screen loads. */
export function prefetchMenu(): void {
  void fetchMenu().catch(() => undefined);
}

export function handOffOrder(order: Order): void {
  handoff = order;
}

/** The order handed over for this id (not consumed here, so a development double render still sees it). */
export function peekHandedOffOrder(id: number): Order | null {
  return handoff && handoff.id === id ? handoff : null;
}

/** Called once the screen has started its own fetch, so an old copy is never shown for a later visit. */
export function dropHandedOffOrder(): void {
  handoff = null;
}

export function clearPosCache(): void {
  menu = null;
  inFlight = null;
  handoff = null;
}
