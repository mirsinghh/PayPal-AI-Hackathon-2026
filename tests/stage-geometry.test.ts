import { describe, expect, it } from "vitest";
import { arc, arcPoint, priceX } from "@/lib/stage-geometry";
import { slipRef } from "@/lib/offer-view";

describe("stage geometry", () => {
  const a = { x: 100, y: 100 };
  const b = { x: 300, y: 100 };

  it("arc endpoints are exactly the two nodes, so markers start and land on them", () => {
    const k = arc(a, b);
    expect(arcPoint(k, 0)).toEqual(a);
    expect(arcPoint(k, 1)).toEqual(b);
  });

  it("bows sideways, never along the chord, and the middle is displaced by half the control offset", () => {
    const k = arc(a, b, 0.2);
    const mid = arcPoint(k, 0.5);
    expect(mid.x).toBeCloseTo(200);
    expect(Math.abs(mid.y - 100)).toBeCloseTo(0.5 * 0.2 * 200); // chord 200 px, bow 0.2
  });

  it("is safe for coincident points", () => {
    const k = arc(a, a);
    expect(Number.isFinite(arcPoint(k, 0.5).x)).toBe(true);
  });
});

describe("price scale", () => {
  it("maps linearly inside the range and clamps outside it", () => {
    expect(priceX(15_000, 10_000, 20_000, 400, 0)).toBe(200);
    expect(priceX(5_000, 10_000, 20_000, 400)).toBe(6);
    expect(priceX(99_000, 10_000, 20_000, 400)).toBe(394);
  });
});

describe("slip reference", () => {
  it("is stable, short and derived from the session id only", () => {
    const id = "ses_e1aef51f-e6d1-4f8c-8345-0d4427ef9e5d";
    expect(slipRef(id)).toBe("AD-EF9E5D");
    expect(slipRef(id)).toBe(slipRef(id));
    expect(slipRef(id)).toMatch(/^AD-[A-Z0-9]{6}$/);
  });
});
