import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

// Tests run inside workerd against the real Worker config (architecture testing
// standard: Vitest + Workers pool, co-located src/**/*.test.ts).
// Config shape per current docs (pool-workers 0.20.x plugin API, Vitest ≥4.1).
// agents() mirrors vite.config.ts — transforms @callable() decorators in agent classes.
export default defineConfig({
  plugins: [
    agents(),
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" }
    })
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
