/**
 * Client-safe product visuals. The demo catalog covers six categories; every image is an original
 * illustration of the *category* (never of a specific real model), so it can't misrepresent a product.
 * `tests/sellers.test.ts` keeps this in sync with `server/agents/catalog.ts`.
 */
export type ProductCategory = "headphones" | "laptop" | "smartphone" | "smartwatch" | "running-shoes" | "monitor";

const CATEGORY_KEYWORDS: Record<ProductCategory, RegExp> = {
  headphones: /head\s?phone|earbud|earphone|auricular|cascos/i,
  laptop: /laptop|notebook|portátil|portatil|ultrabook/i,
  smartphone: /smart\s?phone|\bphones?\b|móvil|movil|mobile/i,
  smartwatch: /smart\s?watch|watch|reloj|fitness (band|tracker)/i,
  "running-shoes": /running|shoe|sneaker|trainer|zapatilla/i,
  monitor: /monitor|display|screen|pantalla/i,
};

export const CATEGORY_IMAGE: Record<ProductCategory, string> = {
  headphones: "/products/headphones.svg",
  laptop: "/products/laptop.svg",
  smartphone: "/products/smartphone.svg",
  smartwatch: "/products/smartwatch.svg",
  "running-shoes": "/products/running-shoes.svg",
  monitor: "/products/monitor.svg",
};

export function matchProductCategory(query: string): ProductCategory | null {
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [ProductCategory, RegExp][]) {
    if (re.test(query)) return cat;
  }
  return null;
}

/** Suggestions that the demo catalog can actually serve (shown as placeholder examples). */
export const EXAMPLE_REQUESTS = [
  "Find me wireless noise-cancelling headphones under €300",
  "A 14-inch laptop for work, max €1,200",
  "Running shoes with free shipping, up to €100",
  "A 27-inch monitor under €250",
] as const;
