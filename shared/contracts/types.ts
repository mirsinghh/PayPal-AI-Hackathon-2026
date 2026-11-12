// Shared domain contracts (see AgentDeal_DOCS/DOCS/07_MODELO_DE_DATOS_Y_APIS.md).
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
  validatedAt: string;
}

/** v0_rules: deterministic simulation. multi_agent: real Gemini agents. */
export type NegotiationMode = "v0_rules" | "multi_agent";

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
  agentRun?: AgentRunMeta;
}

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
}

export interface ApiError {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
}
