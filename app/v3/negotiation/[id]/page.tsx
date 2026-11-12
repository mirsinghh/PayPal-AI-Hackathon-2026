import { Suspense } from "react";
import { NegotiationExperience } from "@/components/v3/negotiation/NegotiationExperience";
import { LoadingScreen } from "@/components/v3/ui";

// `params` is runtime data: read it inside Suspense so the shell can be served instantly (Cache Components).
export default function V3NegotiationPage({ params }: PageProps<"/v3/negotiation/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Agent D is opening your mission…" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/v3/negotiation/[id]">["params"] }) {
  const { id } = await params;
  return <NegotiationExperience id={id} />;
}
