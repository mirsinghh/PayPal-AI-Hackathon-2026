import { Suspense } from "react";
import { LoadingState } from "@/components/ui";
import { Checkout } from "./Checkout";

export default function CheckoutPage({ params }: PageProps<"/checkout/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Preparing secure checkout…" />}>
      <CheckoutLoader params={params} />
    </Suspense>
  );
}

async function CheckoutLoader({ params }: { params: PageProps<"/checkout/[id]">["params"] }) {
  const { id } = await params;
  // The PayPal client ID is public by design; the secret never leaves the server.
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const sandboxOnly = process.env.PAYPAL_ENV === "sandbox";
  return <Checkout sessionId={id} clientId={sandboxOnly ? clientId : ""} />;
}
