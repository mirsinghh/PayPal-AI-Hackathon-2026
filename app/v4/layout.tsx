import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./v4.css";
import { AppBaseProvider } from "@/lib/v3/base";
import { V3Header, V3HeaderFallback } from "@/components/v3/Chrome";
import { V4Footer } from "@/components/v4/V4Footer";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--nf-v3-display", display: "swap", axes: ["opsz"] });
const sans = Figtree({ subsets: ["latin"], variable: "--nf-v3-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AgentDeal V4 · The Negotiation Room", template: "%s · AgentDeal V4" },
  description: "Watch Agent D negotiate with four store agents, see why it recommends one offer in the Decision Lab, then approve and pay with PayPal Sandbox.",
};

export const viewport: Viewport = { themeColor: "#fbfaf6", width: "device-width", initialScale: 1 };

/** V4 is its own root layout, like V3: own <html>, fonts and stylesheet (built on the V3 design system). */
export default function V4RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="v3-root flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-v3-md focus:bg-v3-surface focus:px-4 focus:py-3 focus:font-bold focus:shadow-v3-lift">
          Skip to content
        </a>
        <AppBaseProvider base="/v4">
          <Suspense fallback={<V3HeaderFallback />}>
            <V3Header />
          </Suspense>
          <main id="main" className="flex-1">
            {children}
          </main>
          <V4Footer />
        </AppBaseProvider>
      </body>
    </html>
  );
}
