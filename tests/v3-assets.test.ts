import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FRAME_SIZE, SPRITES, SPRITE_NAMES, poseUrl, sheetUrl } from "@/lib/v3/mascot/manifest";

const pub = (url: string) => path.join(process.cwd(), "public", url);
const manifestPath = pub("/agent-d/v3/manifest.json");

describe("Agent D V3 assets", () => {
  it("ships the pack manifest and every sheet and pose the code references", () => {
    expect(existsSync(manifestPath)).toBe(true);
    for (const s of SPRITE_NAMES) {
      expect(existsSync(pub(sheetUrl(s))), `${s} sheet`).toBe(true);
      expect(existsSync(pub(poseUrl(s))), `${s} pose`).toBe(true);
      expect(statSync(pub(sheetUrl(s))).size).toBeGreaterThan(10_000);
    }
  });

  it("matches the art pack manifest (frames, timing, playback), so the two cannot drift", () => {
    const pack = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(pack.frameSize).toBe(FRAME_SIZE);
    expect(Object.keys(pack.states).sort()).toEqual([...SPRITE_NAMES].sort());
    for (const s of SPRITE_NAMES) {
      expect(SPRITES[s].frames).toBe(pack.states[s].frames);
      expect(SPRITES[s].frameMs).toBe(pack.states[s].durationMs);
      expect(SPRITES[s].playback).toBe(pack.states[s].playback);
    }
  });

  it("keeps the frame cadence inside the pack's 70-100 ms range", () => {
    for (const s of SPRITE_NAMES) {
      expect(SPRITES[s].frameMs).toBeGreaterThanOrEqual(70);
      expect(SPRITES[s].frameMs).toBeLessThanOrEqual(100);
    }
  });
});
