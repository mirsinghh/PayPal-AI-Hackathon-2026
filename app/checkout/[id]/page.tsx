import { Suspense } from "react";
import { CheckoutExperience } from "@/components/v3/checkout/CheckoutExperience";
import { LoadingScreen } from "@/components/v3/ui";

// The assisted checkout is the V3 one, unchanged (same PayPal flow); its links are relative to the app root.
export default function CheckoutPage({ params }: PageProps<"/checkout/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Preparing secure checkout…" />}>
      <CheckoutLoader params={params} />
    </Suspense>
  );
}

async function CheckoutLoader({ params }: { params: PageProps<"/checkout/[id]">["params"] }) {
  const { id } = await params;
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const sandboxOnly = process.env.PAYPAL_ENV === "sandbox";
  return <CheckoutExperience sessionId={id} clientId={sandboxOnly ? clientId : ""} />;
}
