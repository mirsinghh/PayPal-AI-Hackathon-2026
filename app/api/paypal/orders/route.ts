import { z } from "zod";
import { apiError, rateLimited, readJsonBody } from "@/server/http";
import { PaymentError, createPaymentOrder } from "@/server/paypal/payments";
import { getSession } from "@/server/db/store";
import { ownerAllowed } from "@/server/auth/request";

// Note: the request deliberately has no `amount` field. The server derives it from the stored, approved offer.
const bodySchema = z.object({ sessionId: z.string().min(1).max(100), offerId: z.string().min(1).max(100).optional() });

export async function POST(req: Request) {
  if (rateLimited(req, "paypal-orders", 20)) {
    return apiError(429, "RATE_LIMITED", "Too many attempts. Try again shortly.", { retryable: true });
  }
  const body = bodySchema.safeParse(await readJsonBody(req));
  if (!body.success) return apiError(400, "INVALID_REQUEST", "Missing session.");
  try {
    // A session that belongs to a user can only be paid by that (verified) user.
    const owned = await getSession(body.data.sessionId);
    if (owned) {
      const guard = await ownerAllowed(req, owned.ownerId);
      if (!guard.ok) return guard.res;
    }
    const { payment, reused } = await createPaymentOrder(body.data.sessionId, body.data.offerId);
    return Response.json(payment, { status: reused ? 200 : 201 });
  } catch (e) {
    return paymentErrorResponse(e);
  }
}

function paymentErrorResponse(e: unknown): Response {
  if (e instanceof PaymentError) return apiError(e.status, e.code, e.message, { retryable: e.retryable });
  console.error("[paypal] unexpected", (e as Error).message);
  return apiError(500, "INTERNAL", "Something went wrong with the payment.", { retryable: true });
}
