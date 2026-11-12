import { Hero } from "@/components/v3/home/Hero";
import { HowItWorks } from "@/components/v3/home/HowItWorks";
import { LiveDemo } from "@/components/v3/home/LiveDemo";
import { ApprovalSection, Benefits, FinalCta, PayPalSection, Transparency } from "@/components/v3/home/Sections";

export default function V3Home() {
  return (
    <>
      <Hero />
      <Benefits />
      <HowItWorks />
      <LiveDemo />
      <ApprovalSection />
      <PayPalSection />
      <Transparency />
      <FinalCta />
    </>
  );
}
