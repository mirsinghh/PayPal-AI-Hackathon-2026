import { randomUUID } from "node:crypto";
import type { ApiError } from "@/shared/contracts/types";

export function apiError(
  status: number,
  code: string,
  message: string,
  opts: { retryable?: boolean; fieldErrors?: Record<string, string> } = {},
): Response {
  const body: ApiError = {
    code,
    message,
    requestId: `req_${randomUUID()}`,
    retryable: opts.retryable ?? false,
    ...(opts.fieldErrors ? { fieldErrors: opts.fieldErrors } : {}),
  };
  return Response.json(body, { status });
}

/** Tiny in-memory fixed-window rate limiter (demo-grade; use a shared store in production). */
const hits = new Map<string, { count: number; resetAt: number }>();
export function rateLimited(req: Request, bucket: string, limit: number, windowMs = 60_000): boolean {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  h.count++;
  return h.count > limit;
}

export async function readJsonBody(req: Request, maxBytes = 8_000): Promise<unknown | undefined> {
  const text = await req.text();
  if (text.length > maxBytes) return undefined;
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return undefined;
  }
}
