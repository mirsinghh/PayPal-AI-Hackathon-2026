// Shared domain contracts (see AgentD_DOCS/DOCS/07_MODELO_DE_DATOS_Y_APIS.md).
// All money values are integer cents in EUR.

export const SELLER_IDS = ["nova", "orbit", "prism", "vertex"] as const;
export type SellerId = (typeof SELLER_IDS)[number];

export const PRIORITIES = ["lowest_price", "fast_delivery", "best_value"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PREFERENCES = ["warranty", "fast_delivery", "free_shipping"] as const;
export type Preference = (typeof PREFERENCES)[number];

export type Strategy = "price_fighter" | "fast_delivery" | "premium_value" | "hard_negotiator";

export interface ProductIntent {
  productQuery: string;
  budgetCents: number;
  currency: "EUR";
  priority: Priority;
  preferences: Preference[];
  language: "en";
}

export interface SellerPolicy {
  sellerId: SellerId;
  displayName: string;
  strategy: Strategy;
  policyVersion: string;
  maxDiscountBps: number;
  deliveryDays: number;
  warrantyMonths: number;
  freeShipping: boolean;
}

export interface Offer {
  offerId: string;
  sessionId: string;
  sellerId: SellerId;
  productLabel: string;
  initialPriceCents: number;
  finalPriceCents: number;
  discountCents: number;
  minPriceCents: number;
  deliveryDays: number;
  warrantyMonths: number;
  freeShipping: boolean;
  eligible: boolean;
  ineligibilityReasons: string[];
  offerExpiresAt: string;
  policyVersion: string;
  /**
   * Multi-agent (phase 2) details. Absent on V0 offers.
   * When present, finalPriceCents is the all-in total payable: itemPriceCents + shippingCents.
   */
  catalog?: OfferCatalogInfo;
}

export interface OfferCatalogInfo {
  sku: string;
  productName: string;
  imageUrl: string;
  itemPriceCents: number;
  shippingCents: number;
  stock: number;
  returnDays: number;
}

export type EventPhase = "initialize" | "discover" | "offers" | "negotiate" | "evaluate" | "complete";

export type EventType =
  | "AGENT_INITIALIZED"
  | "SELLER_DISCOVERED"
  | "OFFER_RECEIVED"
  | "BUYER_MESSAGE"
  | "COUNTEROFFER_RECEIVED"
  | "REQUIREMENT_VERIFIED"
  | "SELLER_REJECTED"
  | "OFFER_EVALUATED"
  | "WINNER_SELECTED"
  | "NEGOTIATION_COMPLETE"
  // Phase 2 (real multi-agent) events
  | "BUYER_DECISION"
  | "AGENT_FALLBACK"
  | "OFFER_REJECTED_BY_SERVER";

export interface NegotiationEvent {
  eventId: string;
  sessionId: string;
  sequence: number;
  atMs: number;
  phase: EventPhase;
  type: EventType;
  sellerId: SellerId | null;
  payload: Record<string, unknown>;
  feedText: string;
}

export interface Evaluation {
  evaluationId: string;
  sessionId: string;
  rankedOfferIds: string[];
  recommendedOfferId: string;
  scores: Record<string, number>;
  aiSummary: string;
  aiReasons: string[];
  tradeoffs: string[];
  source: "llm" | "rules_fallback";
  modelName: string | null;
  /** Provider that wrote the explanation ("groq" | "gemini"). Absent on sessions created before provider tracking. */
  provider?: string | null;
  validatedAt: string;
}

/** v0_rules: deterministic simulation. multi_agent: real model agents (Groq or Gemini). */
export type NegotiationMode = "v0_rules" | "multi_agent";

/**
 * What the user chose before the negotiation started (V5 selector). It only governs who writes the negotiation replies:
 *  - "server": deterministic backend rules, no model call for negotiation replies.
 *  - "ai": real model agents. If they cannot run, the session says so (`mode: "v0_rules"` + `fallbackReason`).
 * It never changes the request analysis provider.
 */
export const RESPONSE_MODES = ["server", "ai"] as const;
export type ResponseMode = (typeof RESPONSE_MODES)[number];

export interface AgentRunMeta {
  model: string | null;
  startedAt: string;
  finishedAt: string | null;
  llmCallsAttempted: number;
  llmCallsSucceeded: number;
  fallbackCount: number;
  rejectedProposals: number;
  inputTokens: number;
  outputTokens: number;
  /** Set when the run stopped early (deadline / call cap). */
  stoppedReason: string | null;
  buyerChoseTopRanked: boolean | null;
  /** independent_agents (default) or the single-call test script. */
  engine?: "independent_agents" | "single_call_script";
  /** Requests actually sent to the provider (1 in single-call test mode). */
  realModelCalls?: number;
  /**
   * Technical summary (added with the provider layer). Every number is either counted by the engine or reported by the
   * provider; nothing is estimated. All optional: older sessions don't have them.
   */
  provider?: string | null;
  buyerModel?: string | null;
  sellerModel?: string | null;
  explanationModel?: string | null;
  http429?: number;
  /** Sum of reasoning tokens when the provider reported them; null/absent = not reported. */
  reasoningTokens?: number | null;
  durationMs?: number;
  /** "completed", or why the run stopped early (deadline, call_cap, quota_exhausted, model_unavailable...). */
  endedReason?: string;
  /** Agent turns that produced a recorded reply, split by who wrote the text. */
  turns?: { ai: number; fallback: number };
  /** Why turns fell back to rules: http_429, timeout, provider_error, invalid_structure, policy_rejected, call_budget, deadline, quota_exhausted. */
  fallbackCauses?: Record<string, number>;
  /** The offer Agent D itself proposed in its last final turn (null if none). The server's ranking decides; a difference is a recorded discrepancy. */
  agentProposalOfferId?: string | null;
  /** The most actionable provider problem during the run (absent when the provider never failed). */
  aiIssue?: AiIssue;
  /** Set when a run that stopped without finishing was completed afterwards with server rules (events kept, none repeated). */
  recoveredWithRules?: boolean;
  roles?: Record<string, { attempts: number; succeeded: number; failed: number; http429: number; inputTokens: number; outputTokens: number; reasoningTokens: number | null; models: string[] }>;
}

/** Which provider limit a 429 refers to (requests/tokens per minute/day), when the provider's own message says. */
export type LimitScope = "rpm" | "tpm" | "rpd" | "tpd";

/** What went wrong with an AI provider, told apart: a daily quota is not a rate limit, a bad key is not a timeout. */
export type AiIssueKind = "rate_limit" | "token_limit" | "daily_quota" | "timeout" | "server_error" | "invalid_response" | "structured_failed" | "credentials" | "call_budget" | "unavailable";

/** `retryAfterMs` exists only when the provider reported it. It is never estimated. */
export interface AiIssue {
  kind: AiIssueKind;
  retryAfterMs: number | null;
  scope: LimitScope | null;
}

export type AiStatus = "pending" | "succeeded" | "fallback" | "failed";

export interface NegotiationSession {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  status: "preparing" | "ready" | "negotiating" | "completed" | "failed";
  intent: ProductIntent;
  offers: Offer[];
  events: NegotiationEvent[];
  evaluation: Evaluation;
  recommendedOfferId: string;
  approvedOfferId: string | null;
  approvedAt: string | null;
  aiStatus: AiStatus;
  schemaVersion: "1.0";
  /** Absent on sessions created before phase 2 (treat as v0_rules). */
  mode?: NegotiationMode;
  /** Why the V0 simulation was used instead of the multi-agent run (null when not a fallback). */
  fallbackReason?: string | null;
  /** When that reason was a provider problem: what it was and, if the provider said so, when to retry. */
  fallbackIssue?: AiIssue | null;
  /** The response mode requested before the negotiation (absent on sessions created before V5). Fixed for the whole session. */
  responseMode?: ResponseMode;
  /** Supabase user that owns this session, set by the server from the verified login (never from the client). Null/absent = anonymous. */
  ownerId?: string | null;
  agentRun?: AgentRunMeta;
  /** V5 Auto-Buy: how this negotiation is paid. Absent = "manual" (every session created before Auto-Buy). Fixed for the session. */
  checkoutMode?: CheckoutMode;
  /** The purchase mandate bound to this negotiation (Auto-Buy only). */
  mandateId?: string | null;
  /** Who approved `approvedOfferId`: the user clicking Approve, or the server acting inside a pre-authorised mandate. */
  approvedBy?: "user" | "mandate";
}

/** manual: the user reviews, approves and pays with PayPal's button. auto_buy: Agent D buys inside a pre-authorised mandate. */
export const CHECKOUT_MODES = ["manual", "auto_buy"] as const;
export type CheckoutMode = (typeof CHECKOUT_MODES)[number];

export type PaymentStatus =
  | "creating"
  | "created"
  | "approval_pending"
  | "approved"
  | "capturing"
  | "completed"
  | "cancelled"
  | "failed"
  | "unknown_pending_reconciliation";

export interface PaymentAttempt {
  paymentAttemptId: string;
  sessionId: string;
  offerId: string;
  amountCents: number;
  currency: "EUR";
  status: PaymentStatus;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  createRequestId: string;
  captureRequestId: string;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
  /** Owner of the negotiation this payment belongs to (copied from the session, which got it from the verified login). */
  ownerId?: string | null;
  /** Absent = manual. */
  checkoutMode?: CheckoutMode;
  /** Mandate under which this payment was taken (Auto-Buy only). */
  mandateId?: string | null;
}

/* ---------- V5 Auto-Buy ---------- */

/** The only wording that counts as consent. It is stored with the mandate, together with its version. */
export const MANDATE_AUTHORIZATION_TEXT = "Authorize Agent D to purchase one eligible offer within these limits.";
export const MANDATE_TEXT_VERSION = "1";
/** How long a mandate stays usable. Offers expire after 30 minutes, so the mandate never outlives them. */
export const MANDATE_TTL_MS = 30 * 60 * 1000;

export type MandateStatus =
  | "active" // authorised, waiting for the negotiation to finish
  | "executing" // claimed by exactly one execution
  | "executed" // purchase captured and verified
  | "pending_reconciliation" // PayPal outcome uncertain: never re-run, only reconcile
  | "cancelled" // the user cancelled before execution
  | "expired"
  | "blocked" // the server refused to buy (ineligible, over budget, condition not met...)
  | "failed"; // PayPal refused / needs the buyer

export interface MandateEvidence {
  /** Append-only log of every transition, written by the server. */
  at: string;
  type: string;
  status: MandateStatus;
  detail?: string;
}

export interface PurchaseMandate {
  mandateId: string;
  /** Verified Supabase user. Never taken from the client. */
  ownerId: string;
  sessionId: string;
  productQuery: string;
  /** Hard ceiling in integer cents. Equals the budget of the negotiation the mandate was created with. */
  budgetCents: number;
  currency: "EUR";
  priority: Priority;
  /** Preferences the user selected become MANDATORY conditions for an Auto-Buy purchase. */
  requiredConditions: Preference[];
  /** One purchase per mandate. */
  maxPurchases: 1;
  /** Reference to the user's PayPal authorisation (never the token itself). */
  paymentMethodId: string;
  paymentMethodLabel: string;
  authorizationText: string;
  authorizationTextVersion: string;
  consentedAt: string;
  createdAt: string;
  expiresAt: string;
  status: MandateStatus;
  updatedAt: string;
  /** Filled when the purchase ran. */
  offerId: string | null;
  paymentAttemptId: string | null;
  failureCode: string | null;
  evidence: MandateEvidence[];
}

/** What the user may see of a mandate. Contains no token and no PayPal secret. */
export type PublicMandate = Omit<PurchaseMandate, "ownerId">;

export type PaymentMethodStatus = "pending" | "active" | "revoked" | "failed";

/** The user's PayPal authorisation for future charges (Vault). `tokenCipher` is server-only and encrypted. */
export interface PaymentMethodAuth {
  methodId: string;
  ownerId: string;
  status: PaymentMethodStatus;
  setupTokenId: string;
  paypalCustomerId: string | null;
  /** PayPal's vault payment-token id, AES-256-GCM encrypted. Never leaves the server. */
  tokenCipher: string | null;
  payerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
  failureCode: string | null;
}

export type PublicPaymentMethod = Pick<PaymentMethodAuth, "methodId" | "status" | "payerEmail" | "createdAt" | "verifiedAt">;

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
}
