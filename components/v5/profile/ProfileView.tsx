"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/v3/ui";
import { useAuth } from "@/components/v5/AuthProvider";
import { FACETS, HistoryErrors, HistoryList, MemberGate, Stats, useHistory, when, type Facet } from "./History";

function useLoaded(enabled: boolean) {
  return useHistory(enabled);
}

/** /v5/profile: who you are, what you have achieved, your latest negotiations. */
export function ProfileView() {
  return (
    <MemberGate>
      {(user) => <ProfileBody email={user.email} createdAt={user.createdAt} />}
    </MemberGate>
  );
}

function ProfileBody({ email, createdAt }: { email: string; createdAt: string | null }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const { state, reload } = useLoaded(true);
  const initial = email.slice(0, 1).toUpperCase();
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <title>Your profile</title>
      <header className="v3-card flex flex-wrap items-center justify-between gap-5 p-5 sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-v3-primary font-v3-head text-2xl font-extrabold text-white">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="v3-eyebrow">Your profile</p>
            <h1 className="mt-1 truncate font-v3-head text-[clamp(1.5rem,1.1rem+1.6vw,2.2rem)] font-extrabold leading-tight">{email}</h1>
            <p className="text-sm text-v3-ink2">{createdAt ? `Member since ${when(createdAt).split(",")[0]}` : "Signed in with Supabase Auth"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/v5/brief" className={btn("primary", "md")}>New negotiation</Link>
          <button type="button" className={btn("secondary", "md")} onClick={() => void signOut().then(() => router.push("/v5"))}>
            Sign out
          </button>
        </div>
      </header>

      <div className="mt-6">
        {state.s === "ready" ? (
          <>
            <Stats sessions={state.data.sessions} payments={state.data.payments} />
            <section aria-labelledby="recent-title" className="mt-10">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 id="recent-title" className="v3-h2 text-[1.6rem]">Latest negotiations</h2>
                <Link href="/v5/history" className={btn("ghost", "sm")}>See all history</Link>
              </div>
              <HistoryList data={state.data} facet="negotiations" limit={3} />
            </section>
          </>
        ) : (
          <HistoryErrors state={state} reload={reload} />
        )}
      </div>
    </div>
  );
}

/** /v5/history: every request, with its analysis and negotiation views. */
export function HistoryView() {
  return <MemberGate>{() => <HistoryBody />}</MemberGate>;
}

function HistoryBody() {
  const { state, reload } = useHistory(true);
  const [facet, setFacet] = useState<Facet>("negotiations");
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <title>Your history</title>
      <p className="v3-eyebrow">History</p>
      <h1 className="v3-h2 mt-2 text-[clamp(2rem,1.4rem+2.6vw,3.2rem)]">Everything you asked Agent D for.</h1>
      {state.s !== "ready" ? (
        <div className="mt-8"><HistoryErrors state={state} reload={reload} /></div>
      ) : (
        <>
          <div className="mt-6"><Stats sessions={state.data.sessions} payments={state.data.payments} /></div>
          <div role="group" aria-label="History view" className="mt-8 inline-flex gap-1 rounded-v3-md bg-v3-sunken p-1">
            {FACETS.map((f) => (
              <button key={f.id} type="button" aria-pressed={facet === f.id} onClick={() => setFacet(f.id)} className={`min-h-11 rounded-[10px] px-4 text-sm font-bold transition-colors duration-(--v3-d1) ${facet === f.id ? "bg-v3-surface text-v3-ink shadow-v3-card" : "text-v3-ink2 hover:text-v3-ink"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="mt-5"><HistoryList data={state.data} facet={facet} /></div>
        </>
      )}
    </div>
  );
}
