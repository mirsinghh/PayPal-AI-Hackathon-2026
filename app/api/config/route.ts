import { connection } from "next/server";
import { multiAgentEnabled } from "@/server/agents/config";

/** Public, non-secret runtime mode so the UI can describe what is real. Read per request, never baked at build time. */
export async function GET() {
  await connection();
  return Response.json({ multiAgent: multiAgentEnabled() });
}
