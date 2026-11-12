"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { FLOW, FlowProgress, Logo } from "@/components/v3/Chrome";
import { btn } from "@/components/v3/ui";
import { IconArrow } from "@/components/v3/icons";
import { useAuth } from "./AuthProvider";

export function V5HeaderFallback() {
  return <div aria-hidden className="h-[72px] border-b border-v3-line" />;
}

const linkCls = "whitespace-nowrap rounded-v3-md px-3 py-2 text-[0.95rem] font-semibold text-v3-ink2 transition-colors duration-(--v3-d1) hover:bg-v3-soft2 hover:text-v3-ink aria-[current=page]:bg-v3-soft aria-[current=page]:text-v3-ink";

/** One header for visitors and members: Home, New negotiation, History, Profile, Sign in / Sign out. */
export function V5Header() {
  const path = usePathname();
  const router = useRouter();
  const { user, accounts, status, signOut } = useAuth();
  const menu = useRef<HTMLDetailsElement>(null);
  const rel = path;
  const flowIndex = FLOW.findIndex((s) => rel === s.path || rel.startsWith(`${s.path}/`));

  useEffect(() => {
    // Close the mobile menu after navigating.
    if (menu.current) menu.current.open = false;
  }, [path]);

  const items: { to: string; label: string }[] = [
    { to: "/", label: "Home" },
    { to: "/brief", label: "New negotiation" },
    ...(accounts ? [{ to: "/history", label: "History" }, { to: "/profile", label: "Profile" }] : [{ to: "/activity", label: "This browser" }]),
  ];
  const current = (to: string) => (to === "/" ? rel === "/" : rel === to || rel.startsWith(`${to}/`));

  async function onSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const account = !accounts ? null : status === "loading" ? (
    <span aria-hidden className="h-10 w-24 animate-pulse rounded-v3-md bg-v3-sunken" />
  ) : user ? (
    <div className="flex items-center gap-2">
      <Link href="/profile" className="hidden max-w-[11rem] truncate rounded-full bg-v3-soft px-3 py-1.5 text-sm font-bold text-v3-ink xl:block" title={user.email}>
        {user.email}
      </Link>
      <button type="button" onClick={onSignOut} className={btn("secondary", "sm")}>
        Sign out
      </button>
    </div>
  ) : (
    <Link href="/login" className={btn("secondary", "sm")}>
      Sign in
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-v3-line bg-v3-bg/90 backdrop-blur supports-[backdrop-filter]:bg-v3-bg/80">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        {flowIndex >= 0 ? (
          <div className="min-w-0 flex-1 px-2 lg:flex lg:justify-center">
            <FlowProgress index={flowIndex} />
          </div>
        ) : (
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {path === "/" &&
              [
                ["#how", "How it works"],
                ["#demo", "Live demo"],
                ["#modes", "Two modes"],
              ].map(([href, label]) => (
                <a key={href} href={href} className={`${linkCls} hidden xl:block`}>
                  {label}
                </a>
              ))}
            {items.map((i) => (
              <Link key={i.to} href={i.to} aria-current={current(i.to) ? "page" : undefined} className={linkCls}>
                {i.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          {flowIndex < 0 && (
            // The .v3-btn class is unlayered CSS and would beat Tailwind's `hidden`, so hide a wrapper instead.
            <span className="hidden sm:block lg:hidden xl:block">
              <Link href="/brief" className={btn("primary", "sm")}>
                Start negotiating <IconArrow size={16} />
              </Link>
            </span>
          )}
          <div className="hidden lg:block">{account}</div>
          {/* Phones and tablets: every destination in one disclosure menu. */}
          <details ref={menu} className="group relative lg:hidden">
            <summary className={`${btn("secondary", "sm")} list-none`}>
              <span className="group-open:hidden">Menu</span>
              <span className="hidden group-open:inline">Close</span>
            </summary>
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 rounded-v3-lg border border-v3-line bg-v3-surface p-2 shadow-v3-lift">
              <ul className="space-y-0.5">
                {items.map((i) => (
                  <li key={i.to}>
                    <Link href={i.to} className={`${linkCls} block min-h-11`} aria-current={current(i.to) ? "page" : undefined}>
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {accounts && (
                <div className="mt-2 border-t border-v3-line p-2">
                  {user && <p className="mb-2 truncate text-sm font-bold text-v3-ink2">{user.email}</p>}
                  {account}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
