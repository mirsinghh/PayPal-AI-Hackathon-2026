import { apiError, rateLimited } from "@/server/http";
import { PaymentError, captureOrder } from "@/server/paypal/payments";
import { getPaymentByOrderId, getSession } from "@/server/db/store";
import { ownerAllowed } from "@/server/auth/request";

export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  if (rateLimited(req, "paypal-capture", 20)) {
    return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  }
  const { orderId } = await ctx.params;
  try {
    const attempt = await getPaymentByOrderId(orderId);
    const owned = attempt ? await getSession(attempt.sessionId) : null;
    if (owned) {
      const guard = await ownerAllowed(req, owned.ownerId);
      if (!guard.ok) return guard.res;
    }
    return Response.json(await captureOrder(orderId));
  } catch (e) {
    if (e instanceof PaymentError) return apiError(e.status, e.code, e.message, { retryable: e.retryable });
    console.error("[paypal] capture unexpected", (e as Error).message);
    return apiError(500, "INTERNAL", "Something went wrong with the payment.", { retryable: true });
  }
}
