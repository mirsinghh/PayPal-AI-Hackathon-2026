"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the UI is mounted. The app lives at the site root, so the default is "" and every screen links with
 * `${base}/path`. The provider remains so the shared screens (brief, checkout, activity) stay mount-point agnostic.
 */
export type AppBase = string;
const BaseContext = createContext<AppBase>("");

export function AppBaseProvider({ base, children }: { base: AppBase; children: ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

export const useAppBase = (): AppBase => useContext(BaseContext);
