"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useAppBase } from "@/lib/v3/base";

/** A link inside the current UI (V3 or V4): `to` is relative to the mount point, e.g. "/brief". */
export function BaseLink({ to, ...rest }: { to: string } & Omit<ComponentProps<typeof Link>, "href">) {
  const base = useAppBase();
  return <Link href={`${base}${to}`} {...rest} />;
}
