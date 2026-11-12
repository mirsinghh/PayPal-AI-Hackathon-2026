"use client";

import { aiNotice, type AiIssue, type AiIssueKind } from "@/server/ai/limits";
import { Notice, Spinner, btn } from "@/components/v3/ui";

/** Reasons (session.fallbackReason / /api/config) that are a temporary provider problem, as opposed to AI simply being switched off. */
const TEMPORARY: Record<string, AiIssueKind> = { model_quota_exhausted: "rate_limit", provider_credentials: "credentials", provider_unavailable: "unavailable" };
export const isTemporaryAiReason = (reason: string | null | undefined): boolean => !!reason && reason in TEMPORARY;
export const issueKindForReason = (reason: string | null | undefined): AiIssueKind => (reason && TEMPORARY[reason]) || "unavailable";

/**
 * "AI temporarily unavailable": what happened, when to retry (only if the provider said so) and what the user can do.
 * Quota-type problems say "usage limit"; other problems never claim a quota. The wording lives in server/ai/limits.ts (tested).
 */
export function AiUnavailableNotice({
  issue,
  reason,
  onContinueWithServerRules,
  onTryAgain,
  trying = false,
  className = "",
}: {
  issue: AiIssue | null;
  reason?: string | null;
  /** Switches to Server Rules. Pass only when the user is currently on AI Agents. */
  onContinueWithServerRules?: () => void;
  /** Asks again (brief: re-reads availability; room: starts a new AI negotiation). */
  onTryAgain?: () => void;
  trying?: boolean;
  className?: string;
}) {
  const n = aiNotice(issue, issueKindForReason(reason));
  return (
    <Notice tone="warn" title={n.title} className={className}>
      <p>{n.text}</p>
      <p className="mt-1 font-semibold">{n.retry}</p>
      {(onContinueWithServerRules || (onTryAgain && n.canRetry)) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onContinueWithServerRules && (
            <button type="button" onClick={onContinueWithServerRules} className={btn("primary", "sm")}>
              Continue with server rules
            </button>
          )}
          {onTryAgain && n.canRetry && (
            <button type="button" onClick={onTryAgain} disabled={trying} className={btn("secondary", "sm")}>
              {trying ? (
                <>
                  <Spinner size={14} /> Checking…
                </>
              ) : (
                "Try AI again"
              )}
            </button>
          )}
        </div>
      )}
    </Notice>
  );
}
