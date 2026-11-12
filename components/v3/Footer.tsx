import Link from "next/link";
import { DEMO_NOTICE } from "@/shared/format";

export function V3Footer() {
  return (
    <footer className="mt-24 border-t border-v3-line bg-v3-sunken/60">
      <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <p className="max-w-3xl text-sm text-v3-ink2">{DEMO_NOTICE} Agent D is an original mascot; the four stores are fictional and not affiliated with any real company.</p>
        <nav aria-label="Versions" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          <Link href="/v3/activity" className="inline-flex min-h-11 items-center px-1 underline decoration-v3-line-strong underline-offset-4 hover:text-v3-primary-ink">
            My activity
          </Link>
          <Link href="/v3" className="inline-flex min-h-11 items-center px-1 underline decoration-v3-line-strong underline-offset-4 hover:text-v3-primary-ink">
            AgentDeal V3
          </Link>
          {/* A different root layout: Next performs a full page load back to the classic UI, which is untouched. */}
          <Link href="/" prefetch={false} className="inline-flex min-h-11 items-center px-1 underline decoration-v3-line-strong underline-offset-4 hover:text-v3-primary-ink">
            Classic version
          </Link>
        </nav>
      </div>
    </footer>
  );
}
