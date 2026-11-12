import Link from "next/link";
import { DEMO_NOTICE } from "@/shared/format";
import { BRAND } from "@/shared/brand";

const link = "inline-flex min-h-11 items-center px-1 underline decoration-v3-line-strong underline-offset-4 hover:text-v3-primary-ink";

export function V5Footer() {
  return (
    <footer className="mt-24 border-t border-v3-line bg-v3-sunken/60">
      <div className="mx-auto grid w-full max-w-[1240px] gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div className="max-w-3xl space-y-2 text-sm text-v3-ink2">
          <p className="font-v3-head text-base font-extrabold text-v3-ink">{BRAND.tagline}</p>
          <p>
            {BRAND.scope} {DEMO_NOTICE} Agent D is an original mascot; the four stores and their characters are fictional and not affiliated with any real company. Built for the PayPal AI Hackathon.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          <Link href="/" className={link}>
            Home
          </Link>
          <Link href="/brief" className={link}>
            New negotiation
          </Link>
          <Link href="/activity" className={link}>
            This browser&apos;s activity
          </Link>
        </nav>
      </div>
    </footer>
  );
}
