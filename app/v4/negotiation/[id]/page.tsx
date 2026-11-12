import { Suspense } from "react";
import { NegotiationRoom } from "@/components/v4/room/NegotiationRoom";
import { LoadingScreen } from "@/components/v3/ui";

// `params` is runtime data: read it inside Suspense so the shell can be served instantly (Cache Components).
export default function V4NegotiationPage({ params }: PageProps<"/v4/negotiation/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Agent D is opening the negotiation room…" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/v4/negotiation/[id]">["params"] }) {
  const { id } = await params;
  return <NegotiationRoom id={id} />;
}
