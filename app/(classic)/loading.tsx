import { LoadingState } from "@/components/ui";

// Suspense boundary for route params (required by Cache Components) and a calm first paint.
export default function Loading() {
  return <LoadingState label="Loading…" />;
}
