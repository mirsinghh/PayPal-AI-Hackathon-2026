import { apiError } from "@/server/http";
import { PaymentError, getPaymentStatus } from "@/server/paypal/payments";

export async function GET(_req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  try {
    return Response.json(await getPaymentStatus(orderId));
  } catch (e) {
    if (e instanceof PaymentError) return apiError(e.status, e.code, e.message, { retryable: e.retryable });
    console.error("[paypal] status unexpected", (e as Error).message);
    return apiError(500, "INTERNAL", "Something went wrong with the payment.", { retryable: true });
  }
}
