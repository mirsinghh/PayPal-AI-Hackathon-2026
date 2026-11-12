import { LoadingScreen } from "@/components/v3/ui";

// Suspense boundary for route params (required by Cache Components) and a calm first paint.
export default function Loading() {
  return <LoadingScreen label="Loading…" />;
}
