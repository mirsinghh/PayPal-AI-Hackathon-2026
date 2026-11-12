import { Suspense } from "react";
import { DealExperience } from "@/components/v3/offers/DealExperience";
import { LoadingScreen } from "@/components/v3/ui";

// `params` is runtime data: read it inside Suspense so the shell can be served instantly (Cache Components).
export default function V3DealPage({ params }: PageProps<"/v3/deals/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Agent D is laying out your offers…" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/v3/deals/[id]">["params"] }) {
  const { id } = await params;
  return <DealExperience id={id} />;
}
