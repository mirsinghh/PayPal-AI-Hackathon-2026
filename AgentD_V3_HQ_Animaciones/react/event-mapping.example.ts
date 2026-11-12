// Ejemplo conceptual: adapta los tipos de eventos a los de TU backend.
// Nunca simules un pago confirmado únicamente al terminar una animación.
import type { AgentDState } from "./AgentDSprite";

export type NegotiationVisualEvent =
  | { type: "SEARCH_STARTED" }
  | { type: "STORE_CONTACTED"; storeId: string }
  | { type: "OFFER_RECEIVED"; storeId: string; amount: number }
  | { type: "COUNTEROFFER_SENT"; storeId: string }
  | { type: "OFFER_REJECTED"; storeId: string }
  | { type: "OFFER_ACCEPTED_BY_USER"; storeId: string }
  | { type: "BEST_OFFER_SELECTED"; storeId: string }
  | { type: "PAYMENT_CAPTURED"; paymentId: string }
  | { type: "NEGOTIATION_FINISHED" };

export function stateFromEvent(event: NegotiationVisualEvent): AgentDState {
  switch(event.type) {
    case "SEARCH_STARTED": return "search";
    case "STORE_CONTACTED": return "run";
    case "OFFER_RECEIVED": return "offer_received";
    case "COUNTEROFFER_SENT": return "counteroffer";
    case "OFFER_REJECTED": return "reject";
    case "OFFER_ACCEPTED_BY_USER": return "accept";
    case "BEST_OFFER_SELECTED": return "success";
    case "PAYMENT_CAPTURED": return "payment_approved";
    case "NEGOTIATION_FINISHED": return "idle";
  }
}
