/** Quiet dot grid used as the "drafting paper" behind the agent map. Flat dots, no gradient. */
export function DotGrid({ gap = 18, className = "" }: { gap?: number; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <pattern id="dot-grid" width={gap} height={gap} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="var(--line)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)" />
    </svg>
  );
}
