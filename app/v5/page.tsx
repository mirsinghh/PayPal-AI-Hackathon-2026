import { LiveDemo } from "@/components/v3/home/LiveDemo";
import { ApprovalSection, PayPalSection, Transparency } from "@/components/v3/home/Sections";
import { V5Benefits, V5FinalCta, V5Hero, V5HowItWorks, V5Modes } from "@/components/v5/landing/Landing";

/** The explanatory landing: promise, how it works, the recorded demo, the two reply modes, honesty, call to action. */
export default function V5Home() {
  return (
    <>
      <V5Hero />
      <V5HowItWorks />
      <LiveDemo />
      <V5Modes />
      <V5Benefits />
      <ApprovalSection />
      <PayPalSection />
      <Transparency />
      <V5FinalCta />
    </>
  );
}
