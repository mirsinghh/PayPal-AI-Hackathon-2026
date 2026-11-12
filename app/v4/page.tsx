import { BriefExperience } from "@/components/v3/brief/BriefExperience";

// V4 opens on the brief itself: "What are we hunting for today?". The unchanged V3 brief runs under /v4.
export default function V4Home() {
  return <BriefExperience />;
}
