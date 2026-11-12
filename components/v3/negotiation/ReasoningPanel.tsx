import type { ReasoningItem, ReasoningOrigin } from "@/lib/v3/reasoning";
import { Chip, type ChipTone } from "@/components/v3/ui";

const ORIGIN: Record<ReasoningOrigin, { label: string; tone: ChipTone }> = {
  ai: { label: "AI agent · recorded", tone: "primary" },
  fallback: { label: "Rules fallback", tone: "warn" },
  server: { label: "Server check", tone: "neutral" },
  computed: { label: "Computed from offers", tone: "accent" },
};

/**
 * Why Agent D acts the way it does, as far as the record shows. Each line is one persisted event with its origin;
 * nothing is a guess about the model's private thoughts. The trade-off lines are plain arithmetic over visible offers.
 */
export function ReasoningPanel({ items, facts, live }: { items: ReasoningItem[]; facts: string[]; live: boolean }) {
  const recent = items.slice(-6).reverse();
  return (
    <section aria-labelledby="reasoning-title" className="v3-card p-5">
      <h2 id="reasoning-title" className="font-v3-head text-lg font-extrabold">
        How Agent D is deciding
      </h2>
      <p className="mt-0.5 text-xs text-v3-ink2">{live ? "Recorded reasoning and checks, with where each line came from." : "Recorded checks from the replay, with where each line came from."}</p>

      {facts.length > 0 && (
        <div className="mt-3 rounded-v3-md border border-v3-accent/40 bg-v3-accent-soft p-3">
          <p className="mb-1 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-v3-warn">
            Trade-off on the table <Chip tone="accent" className="!py-0 !text-[0.66rem]">Computed from offers</Chip>
          </p>
          <ul className="space-y-1 text-sm font-semibold leading-snug">
            {facts.map((f) => (
              <li key={f} className="text-pretty">
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recent.length === 0 ? (
        <p className="mt-4 text-sm text-v3-ink2">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {recent.map((r) => {
            const o = ORIGIN[r.origin];
            return (
              <li key={r.eventId} className="border-l-2 border-v3-line-strong pl-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                  {r.title}
                  <Chip tone={o.tone} className="!py-0 !text-[0.66rem]">
                    {o.label}
                  </Chip>
                </p>
                {r.detail && <p className="mt-1 text-sm leading-snug text-v3-ink text-pretty">“{r.detail}”</p>}
                {r.evidence.length > 0 && <p className="mt-1 text-xs font-semibold text-v3-ink2">{r.evidence.join(" · ")}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
