import { z } from "zod";
import { apiError, readJsonBody } from "@/server/http";
import { getPaymentsBySession, getSession, saveSession, withLock } from "@/server/db/store";
import { isOfferExpired, isSessionExpired } from "@/server/negotiation/service";

const bodySchema = z.object({ offerId: z.string().min(1).max(100) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = bodySchema.safeParse(await readJsonBody(req));
  if (!body.success) return apiError(400, "INVALID_REQUEST", "Missing offer.");

  return withLock(`session:${id}`, async () => {
    const session = await getSession(id);
    if (!session) return apiError(404, "NOT_FOUND", "We couldn't find that negotiation.");
    if (isSessionExpired(session)) return apiError(410, "SESSION_EXPIRED", "Your demo session has expired.");

    if (session.status !== "ready" && session.status !== "completed") {
      return apiError(409, "NEGOTIATION_NOT_READY", "The negotiation hasn't finished yet.");
    }
    const offer = session.offers.find((o) => o.offerId === body.data.offerId);
    // V0: only the server-recommended, eligible offer can be approved.
    if (!offer || offer.offerId !== session.recommendedOfferId) {
      return apiError(409, "OFFER_MISMATCH", "The selected deal has changed; please review it.");
    }
    if (!offer.eligible) return apiError(422, "OFFER_INELIGIBLE", "This offer isn't eligible.");
    if (isOfferExpired(session, offer.offerId)) {
      return apiError(410, "OFFER_EXPIRED", "This demo offer has expired.");
    }
    const payments = await getPaymentsBySession(id);
    if (payments.some((p) => p.status === "completed")) {
      return apiError(409, "ALREADY_PAID", "This Sandbox payment is already complete.");
    }

    if (session.approvedOfferId !== offer.offerId) {
      session.approvedOfferId = offer.offerId;
      session.approvedAt = new Date().toISOString();
      await saveSession(session);
    }
    return Response.json({
      sessionId: session.sessionId,
      approvedOfferId: session.approvedOfferId,
      approvedAt: session.approvedAt,
      amountCents: offer.finalPriceCents,
      currency: "EUR",
      offerExpiresAt: offer.offerExpiresAt,
    });
  });
}
