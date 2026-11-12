import { apiError } from "@/server/http";
import { ownerAllowed, withAuthCookies } from "@/server/auth/request";
import { getSession, getPaymentsBySession } from "@/server/db/store";
import { recoverInterruptedNegotiation } from "@/server/agents/recover";
import { isNegotiationStale, isSessionExpired } from "@/server/negotiation/service";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session = await getSession(id);
  if (session && isNegotiationStale(session)) {
    // The run died without finishing (e.g. the platform stopped the function). Its confirmed events stay; the negotiation is
    // completed with server rules, labelled as such, or closed as failed when there is nothing honest to rank. Never polled forever.
    session = await recoverInterruptedNegotiation(id);
  }
  if (!session) return apiError(404, "NOT_FOUND", "We couldn't find that negotiation.");
  const guard = await ownerAllowed(req, session.ownerId);
  if (!guard.ok) return guard.res;
  // Anonymous demo sessions expire after 24 h. A signed-in owner can still reopen a finished negotiation from their
  // history (read-only: offers and the approval endpoint still enforce their own expiry).
  const expired = isSessionExpired(session);
  if (expired && !session.ownerId) return apiError(410, "SESSION_EXPIRED", "Your demo session has expired.");
  const payments = await getPaymentsBySession(id);
  const completed = payments.find((p) => p.status === "completed") ?? null;
  const { ownerId: _owner, ...publicSession } = session;
  void _owner;
  return withAuthCookies(Response.json({ ...publicSession, expired, payment: completed ? publicPayment(completed) : null }), guard.auth);
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
