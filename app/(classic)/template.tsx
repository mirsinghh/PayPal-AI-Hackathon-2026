import type { ReactNode } from "react";

/** Re-mounts on every navigation, so each screen eases in. CSS-only: no JS needed, honours reduced motion. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
