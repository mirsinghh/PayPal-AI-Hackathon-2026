import { z } from "zod";
import { SELLER_IDS, type SellerId } from "@/shared/contracts/types";
import { SELLER_BRANDS } from "@/shared/sellers";

/**
 * Structured outputs the models must produce. Prices are item prices in integer cents (shipping is
 * fixed by the seller's catalog and added by the server). Anything that fails these schemas, or the
 * validators in validate.ts, never becomes an offer.
 */
export const sellerReplySchema = z.object({
  action: z.enum(["quote", "concede", "hold"]),
  priceCents: z.number().int().positive(),
  message: z.string().trim().min(5).max(240),
});
export type SellerReply = z.infer<typeof sellerReplySchema>;

export const buyerRoundSchema = z.object({
  rationale: z.string().trim().min(5).max(300),
  moves: z
    .array(
      z.object({
        sellerId: z.enum(SELLER_IDS),
        action: z.enum(["counter", "pass"]),
        targetPriceCents: z.number().int().positive().nullable(),
        message: z.string().trim().max(240),
      }),
    )
    .max(SELLER_IDS.length),
});
export type BuyerRound = z.infer<typeof buyerRoundSchema>;

export const buyerFinalSchema = z.object({
  chosenOfferId: z.string().min(1).max(100),
  summary: z.string().trim().min(10).max(400),
  reasons: z.array(z.string().trim().min(3).max(200)).min(1).max(3),
  tradeoffs: z.array(z.string().trim().min(3).max(200)).max(3),
});
export type BuyerFinal = z.infer<typeof buyerFinalSchema>;

/**
 * What Agent D actually sends back. It addresses stores by their PUBLIC brand name ("store"), so internal ids
 * (nova, orbit...) never appear in its prompt or in the words it writes; the server maps the brand back to the internal
 * id from the canonical seller table before any validation. A legacy `sellerId` is still accepted (Gemini sessions,
 * old fixtures). The limits are the same contract as `buyerRoundSchema`: rationale 5-300 chars, message up to 240.
 */
export const STORE_NAMES = SELLER_IDS.map((id) => SELLER_BRANDS[id].brand) as [string, ...string[]];
const idOfBrand = (brand: string): SellerId => SELLER_IDS.find((id) => SELLER_BRANDS[id].brand === brand) as SellerId;

export const buyerRoundByStoreSchema = z
  .object({
    rationale: z.string().trim().min(5).max(300),
    moves: z
      .array(
        z.object({
          store: z.enum(STORE_NAMES).optional(),
          sellerId: z.enum(SELLER_IDS).optional(),
          action: z.enum(["counter", "pass"]),
          targetPriceCents: z.number().int().positive().nullable(),
          message: z.string().trim().max(240),
        }),
      )
      .max(SELLER_IDS.length),
  })
  .transform((v, ctx): BuyerRound => {
    const moves: BuyerRound["moves"] = [];
    v.moves.forEach((m, i) => {
      const id = m.store ? idOfBrand(m.store) : m.sellerId;
      if (!id) {
        ctx.addIssue({ code: "custom", path: ["moves", i, "store"], message: "store required" });
        return;
      }
      moves.push({ sellerId: id, action: m.action, targetPriceCents: m.targetPriceCents, message: m.message });
    });
    return { rationale: v.rationale, moves };
  });
