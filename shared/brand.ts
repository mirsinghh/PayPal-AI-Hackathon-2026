/**
 * Public identity. The project is AgentD; "Agent D" is the buyer agent (the mascot) and the name the UI speaks with.
 * Technical identifiers (package, storage keys, docs folder) use `agentd`.
 */
export const BRAND = {
  name: "Agent D",
  tagline: "Agent D, it always gets you the best deal.",
  /** The tagline is positioning, not a promise about the whole market: this is shown wherever it is. */
  scope: "Best among the four simulated demo stores Agent D compares, not necessarily the whole market.",
  description:
    "Agent D negotiates with four simulated demo stores and brings back competing offers to compare. Offers are compared only inside this simulated environment, not the whole market. Pay with PayPal Sandbox. No real purchase happens.",
} as const;
