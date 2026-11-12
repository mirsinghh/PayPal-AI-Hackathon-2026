import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./v3.css";
import { V3Header, V3HeaderFallback } from "@/components/v3/Chrome";
import { V3Footer } from "@/components/v3/Footer";

// Display face for headlines and prices only; the UI itself runs in Figtree. Both are self-hosted by next/font.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--nf-v3-display", display: "swap", axes: ["opsz"] });
const sans = Figtree({ subsets: ["latin"], variable: "--nf-v3-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AgentDeal V3 · Agent D finds your next great deal", template: "%s · AgentDeal V3" },
  description:
    "Tell Agent D what you need. It explores four demo stores, negotiates for you and brings back one offer to approve and pay with PayPal Sandbox.",
};

export const viewport: Viewport = {
  themeColor: "#fbfaf6",
  width: "device-width",
  initialScale: 1,
};

/**
 * V3 is its own root layout (app/v3/ sits beside the classic app in app/(classic)/): own <html>, own fonts, own
 * stylesheet. Moving between the two UIs is a full page load by design.
 */
export default function V3RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="v3-root flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-v3-md focus:bg-v3-surface focus:px-4 focus:py-3 focus:font-bold focus:shadow-v3-lift"
        >
          Skip to content
        </a>
        <Suspense fallback={<V3HeaderFallback />}>
          <V3Header />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        <V3Footer />
      </body>
    </html>
  );
}
