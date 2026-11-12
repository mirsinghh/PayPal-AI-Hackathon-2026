import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "../globals.css";
import { DEMO_NOTICE } from "@/shared/format";
import { AppHeader } from "@/components/AppHeader";
import { MotionProvider } from "@/components/MotionProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Editorial serif for a few key moments only (hero, recommended price, receipt amount). All UI stays in Geist.
const display = Instrument_Serif({ variable: "--font-display", weight: "400", style: ["normal", "italic"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentDeal — Your AI agent negotiates. You decide.",
  description:
    "Tell an AI shopping agent what you need. It negotiates with four demo stores and hands you the best offer to approve and pay with PayPal Sandbox.",
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-small focus:shadow-pop"
        >
          Skip to content
        </a>
        <Suspense fallback={<div className="h-14 border-b border-line sm:h-16" />}>
          <AppHeader />
        </Suspense>
        <MotionProvider>
          <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
            {children}
          </main>
        </MotionProvider>
        <footer className="border-t border-line">
          <div className="mx-auto max-w-[1200px] px-4 py-6 text-caption text-ink-2 sm:px-6 lg:px-8">
            <p className="max-w-3xl">{DEMO_NOTICE}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
