#!/usr/bin/env node
/**
 * Prepares the Agent D HQ pack for the V3 web experience.
 *
 *   node scripts/v3-prepare-agent-d.mjs [path-to-pack]
 *
 * Input  (default ./AgentD_V3_HQ_Animaciones, the unzipped AgentD_V3_HQ_Animaciones.zip):
 *   spritesheets/<state>.png   4096x512, 8 frames of 512x512 in a row (RGBA)
 *   png/<state>.png            512x512 static poses (used for reduced motion and tiny avatars)
 *   manifest.json
 * Output (public/agent-d/v3/):
 *   sheets/<state>.webp        the ORIGINAL art, re-encoded as WebP (q92, alpha lossless) ~ 5x smaller than PNG
 *   poses/<state>.webp
 *   manifest.json              copy of the pack manifest (read by tests/v3-assets.test.ts)
 *
 * No frame is redrawn, resized or recoloured: only the container format changes. The originals stay untouched
 * in the pack folder. Re-run this script whenever the pack changes.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");

const packDir = path.resolve(process.argv[2] ?? path.join(root, "AgentD_V3_HQ_Animaciones"));
const outDir = path.join(root, "public", "agent-d", "v3");

if (!fs.existsSync(path.join(packDir, "manifest.json"))) {
  console.error(`Agent D pack not found at ${packDir}.\nUnzip AgentD_V3_HQ_Animaciones.zip there (keeping its folders) or pass the path as an argument.`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"));
fs.mkdirSync(path.join(outDir, "sheets"), { recursive: true });
fs.mkdirSync(path.join(outDir, "poses"), { recursive: true });

const encode = (input) => sharp(input).webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: false }).toBuffer();

let sheetBytes = 0;
let poseBytes = 0;
for (const state of manifest.order) {
  const sheetSrc = path.join(packDir, "spritesheets", `${state}.png`);
  const poseSrc = path.join(packDir, "png", `${state}.png`);
  const meta = await sharp(sheetSrc).metadata();
  const spec = manifest.states[state];
  if (meta.width !== manifest.frameSize * spec.frames || meta.height !== manifest.frameSize) {
    throw new Error(`${state}: spritesheet is ${meta.width}x${meta.height}, expected ${manifest.frameSize * spec.frames}x${manifest.frameSize}`);
  }
  const sheet = await encode(sheetSrc);
  const pose = await encode(poseSrc);
  fs.writeFileSync(path.join(outDir, "sheets", `${state}.webp`), sheet);
  fs.writeFileSync(path.join(outDir, "poses", `${state}.webp`), pose);
  sheetBytes += sheet.length;
  poseBytes += pose.length;
  console.log(`${state.padEnd(17)} sheet ${(sheet.length / 1024).toFixed(0).padStart(4)} KB  pose ${(pose.length / 1024).toFixed(0).padStart(4)} KB`);
}
fs.copyFileSync(path.join(packDir, "manifest.json"), path.join(outDir, "manifest.json"));
console.log(`\n${manifest.order.length} states -> ${path.relative(root, outDir)}  (sheets ${(sheetBytes / 1048576).toFixed(1)} MB, poses ${(poseBytes / 1048576).toFixed(1)} MB)`);
