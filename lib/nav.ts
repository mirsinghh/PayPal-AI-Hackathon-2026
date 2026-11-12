/**
 * Product navigation map. Only entries with status "available" are rendered by the header.
 * "planned" entries are documentation for the roadmap: they need backend that doesn't exist yet
 * (accounts, persisted order history, user preferences) and must NOT be linked or faked in the UI.
 * See AgentDeal_DOCS/DOCS/11_REDISENO_UX_UI.md.
 */
export interface NavItem {
  id: string;
  label: string;
  href: string;
  status: "available" | "planned";
  /** What the feature needs before it can ship. */
  requires?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "assistant", label: "AI Assistant", href: "/", status: "available" },
  {
    id: "negotiations",
    label: "Live negotiations",
    href: "/negotiations",
    status: "planned",
    requires: "A list endpoint for a user's sessions (today a session is only reachable by its id).",
  },
  {
    id: "orders",
    label: "My orders",
    href: "/orders",
    status: "planned",
    requires: "User-scoped order persistence; payments are currently keyed by session only.",
  },
  {
    id: "history",
    label: "Order history",
    href: "/history",
    status: "planned",
    requires: "Same as My orders plus pagination and retention policy.",
  },
  {
    id: "preferences",
    label: "Preferences",
    href: "/preferences",
    status: "planned",
    requires: "User profile storage (default budget, priority, preferences).",
  },
  {
    id: "account",
    label: "Account / PayPal login",
    href: "/account",
    status: "planned",
    requires: "Authentication (PayPal identity / Log in with PayPal) and a user model.",
  },
];

export const availableNav = () => NAV_ITEMS.filter((n) => n.status === "available");
