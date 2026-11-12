"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the UI is mounted. V3 lives at /v3 (the default, so V3 behaves exactly as before); V4 reuses unchanged V3
 * screens (brief, checkout, activity) under /v4 by providing "/v4" here, so their internal links stay inside V4.
 */
export type AppBase = "/v3" | "/v4";
const BaseContext = createContext<AppBase>("/v3");

export function AppBaseProvider({ base, children }: { base: AppBase; children: ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

export const useAppBase = (): AppBase => useContext(BaseContext);
