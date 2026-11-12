import { Suspense } from "react";
import { CheckoutExperience } from "@/components/v3/checkout/CheckoutExperience";
import { LoadingScreen } from "@/components/v3/ui";

export default function V3CheckoutPage({ params }: PageProps<"/v3/checkout/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Preparing secure checkout…" />}>
      <CheckoutLoader params={params} />
    </Suspense>
  );
}

async function CheckoutLoader({ params }: { params: PageProps<"/v3/checkout/[id]">["params"] }) {
  const { id } = await params;
  // The PayPal client ID is public by design; the secret never leaves the server. Sandbox only, like the classic UI.
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const sandboxOnly = process.env.PAYPAL_ENV === "sandbox";
  return <CheckoutExperience sessionId={id} clientId={sandboxOnly ? clientId : ""} />;
}
