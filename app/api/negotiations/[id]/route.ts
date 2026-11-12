import { apiError } from "@/server/http";
import { getSession, getPaymentsBySession, saveSession, withLock } from "@/server/db/store";
import { isNegotiationStale, isSessionExpired } from "@/server/negotiation/service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session = await getSession(id);
  if (session && isNegotiationStale(session)) {
    // The run died without finishing: close it honestly instead of polling forever.
    session = await withLock(`session:${id}`, async () => {
      const fresh = await getSession(id);
      if (fresh && isNegotiationStale(fresh)) {
        fresh.status = "failed";
        fresh.aiStatus = "failed";
        await saveSession(fresh);
      }
      return fresh;
    });
  }
  if (!session) return apiError(404, "NOT_FOUND", "We couldn't find that negotiation.");
  if (isSessionExpired(session)) return apiError(410, "SESSION_EXPIRED", "Your demo session has expired.");
  const payments = await getPaymentsBySession(id);
  const completed = payments.find((p) => p.status === "completed") ?? null;
  return Response.json({ ...session, payment: completed ? publicPayment(completed) : null });
}

function publicPayment(p: { paymentAttemptId: string; paypalOrderId: string | null; paypalCaptureId: string | null; status: string; amountCents: number; currency: string }) {
  return {
    paymentAttemptId: p.paymentAttemptId,
    orderId: p.paypalOrderId,
    captureId: p.paypalCaptureId,
    status: p.status,
    amountCents: p.amountCents,
    currency: p.currency,
  };
}
