import { Suspense } from "react";
import { V4Deal } from "@/components/v4/deal/V4Deal";
import { LoadingScreen } from "@/components/v3/ui";

export default function V4DealPage({ params }: PageProps<"/v5/deals/[id]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Agent D is laying out your offers…" />}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/v5/deals/[id]">["params"] }) {
  const { id } = await params;
  return <V4Deal id={id} />;
}
