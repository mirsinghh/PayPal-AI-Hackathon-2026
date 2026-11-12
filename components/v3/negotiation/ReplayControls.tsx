"use client";

import { SPEEDS, type Speed } from "@/lib/v3/use-playback";
import { IconPause, IconPlay, IconReplay, IconSkip } from "@/components/v3/icons";

/** Pause, speed, skip and replay. Only for the rule-engine replay: a live run cannot be paused, it is real time. */
export function ReplayControls({
  paused,
  speed,
  finished,
  onTogglePause,
  onSpeed,
  onSkip,
  onReplay,
  size = "md",
}: {
  paused: boolean;
  speed: Speed;
  finished: boolean;
  onTogglePause: () => void;
  onSpeed: (s: Speed) => void;
  onSkip: () => void;
  onReplay: () => void;
  size?: "sm" | "md";
}) {
  const b = `v3-btn v3-btn--secondary v3-btn--sm`;
  return (
    <div role="group" aria-label="Replay controls" className="flex flex-wrap items-center gap-2">
      <button type="button" className={b} onClick={onTogglePause} disabled={finished} aria-pressed={paused}>
        {paused ? <IconPlay size={16} /> : <IconPause size={16} />} {paused ? "Resume" : "Pause"}
      </button>
      <div role="group" aria-label="Replay speed" className="inline-flex overflow-hidden rounded-v3-md border border-v3-line-strong bg-v3-surface">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => onSpeed(s)}
            className={`v3-num min-h-11 min-w-12 px-3 text-sm font-extrabold transition-colors duration-(--v3-d1) ${speed === s ? "bg-v3-ink text-white" : "text-v3-ink2 hover:bg-v3-soft2 hover:text-v3-ink"}`}
          >
            {s}×<span className="sr-only"> speed</span>
          </button>
        ))}
      </div>
      {size === "md" && (
        <button type="button" className={b} onClick={onSkip} disabled={finished}>
          <IconSkip size={16} /> Skip to result
        </button>
      )}
      <button type="button" className={b} onClick={onReplay}>
        <IconReplay size={16} /> Replay
      </button>
    </div>
  );
}
