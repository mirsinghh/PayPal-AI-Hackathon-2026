import { z } from "zod";
import { SELLER_IDS } from "@/shared/contracts/types";

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
