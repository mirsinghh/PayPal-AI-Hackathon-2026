import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/v5/AuthProvider";
import { V5Footer } from "@/components/v5/Footer";
import { V5Header, V5HeaderFallback } from "@/components/v5/Header";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--nf-v3-display", display: "swap", axes: ["opsz"] });
const sans = Figtree({ subsets: ["latin"], variable: "--nf-v3-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "AgentDeal · Your AI agent negotiates. You decide.", template: "%s · AgentDeal" },
  description: "Tell Agent D what you want to buy. Four demo stores negotiate, you compare the offers and pay with PayPal Sandbox. Choose server rules or real AI for the replies.",
};

export const viewport: Viewport = { themeColor: "#fbfaf6", width: "device-width", initialScale: 1 };

/** One root layout: fonts, stylesheet, account state and a single header/footer for visitors and members. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`}>
      <body className="v3-root flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-v3-md focus:bg-v3-surface focus:px-4 focus:py-3 focus:font-bold focus:shadow-v3-lift">
          Skip to content
        </a>
          <AuthProvider>
            <Suspense fallback={<V5HeaderFallback />}>
              <V5Header />
            </Suspense>
            <main id="main" className="flex-1">
              {children}
            </main>
            <V5Footer />
          </AuthProvider>
      </body>
    </html>
  );
}
