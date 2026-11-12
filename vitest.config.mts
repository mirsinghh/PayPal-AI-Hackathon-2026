import { defineConfig } from "vitest/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The store reads DATA_DIR when it is first imported (before a test file's own assignment runs), so set it here:
    // tests must never write sessions into the developer's real ./.data folder.
    env: { DATA_DIR: mkdtempSync(path.join(tmpdir(), "agentd-vitest-")) },
  },
});
