import { Fragment, type CSSProperties } from "react";

/**
 * Headline that rises word by word out of a mask (SKILL §2.4). Words are real DOM spans rendered on the server,
 * animated by a CSS keyframe (see .w in globals.css), so it needs no JavaScript and always ends fully visible.
 * The parent carries the full sentence as aria-label so screen readers don't spell it word by word.
 *
 * Deviation from the skill: it does not wait for `document.fonts.ready`. next/font preloads Geist and adjusts the
 * fallback metrics, so there is no visible swap to hide; waiting would require hiding the headline until JS runs.
 */
export function SplitHeading({
  lines,
  className,
  baseMs = 150,
  italicFrom,
}: {
  lines: string[];
  className?: string;
  baseMs?: number;
  /** Index of the first line set in italic (editorial emphasis). */
  italicFrom?: number;
}) {
  let i = 0;
  return (
    <h1 aria-label={lines.join(" ")} style={{ "--base": `${baseMs}ms` } as CSSProperties} className={className}>
      {lines.map((line, li) => (
        <Fragment key={line}>
          {li > 0 && <br />}
          {line.split(" ").map((word, wi) => (
            <Fragment key={`${li}-${wi}`}>
              {wi > 0 && " "}
              <span className={`w ${italicFrom !== undefined && li >= italicFrom ? "italic" : ""}`} aria-hidden="true">
                <span style={{ "--w": i++ } as CSSProperties}>{word}</span>
              </span>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </h1>
  );
}
