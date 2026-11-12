import { SELLER_IDS, type SellerId } from "@/shared/contracts/types";
import type { SellerState } from "@/lib/negotiation-view";
import type { DirectorState } from "@/lib/v3/mascot/director";
import type { ChipTone } from "@/components/v3/ui";

/** Where Agent D stands, as a percentage of the stage width: four store columns and the comparison spot. */
export const SPOT_X: Record<SellerId | "center", number> = { nova: 12.5, orbit: 37.5, prism: 62.5, vertex: 87.5, center: 50 };

export function spotX(spot: string | null | undefined): number {
  return SPOT_X[(spot ?? "center") as SellerId | "center"] ?? SPOT_X.center;
}

/** True while Agent D is running towards a spot to their left, so the sprite can face the way it is going. */
export function walkingLeft(d: DirectorState): boolean {
  return d.active?.state === "running" && spotX(d.lastSellerId) < spotX(d.fromSellerId);
}

export const isSellerId = (v: string | null): v is SellerId => !!v && (SELLER_IDS as readonly string[]).includes(v);

export interface StallPresentation {
  label: string;
  tone: ChipTone;
}

/** Plain label + tone for a store card. Text first; the tone only reinforces it. */
export function stallPresentation(s: SellerState): StallPresentation {
  switch (s.status) {
    case "waiting":
      return { label: "Not found yet", tone: "neutral" };
    case "joined":
      return { label: "Found", tone: "primary" };
    case "asked":
      return { label: "Replying…", tone: "accent" };
    case "offered":
      return { label: "Offer received", tone: "primary" };
    case "countered":
      return s.previousCents !== null && s.priceCents !== null && s.priceCents < s.previousCents
        ? { label: "Price lowered", tone: "success" }
        : { label: "Replied", tone: "primary" };
    case "set_aside":
      return { label: "Set aside", tone: "warn" };
    case "winner":
      return { label: "Best match", tone: "success" };
  }
}
