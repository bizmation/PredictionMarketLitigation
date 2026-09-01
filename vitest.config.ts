import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cloudflareTest,
  readD1Migrations
} from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

// Two projects, because the two kinds of code under test need different runtimes.
//
// "workers" — Worker/Agent/Workflow code, run inside workerd against
//   wrangler.test.jsonc. Story 2.1: D1 migrations are read here in Node
//   (readD1Migrations) and applied in a setup file via applyD1Migrations —
//   workerd has no filesystem, so the SQL crosses the boundary as a
//   TEST_MIGRATIONS binding. See Cloudflare Vitest D1 recipe.
//
// "ui" — presentational components from src/shared/ui. These cannot run in the
//   workers project: vitest-pool-workers externalizes `react`
//   (cloudflare/workers-sdk#10170).

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(rootDir, "migrations"));

  return {
    test: {
      projects: [
        {
          plugins: [
            agents(),
            cloudflareTest({
              wrangler: { configPath: "./wrangler.test.jsonc" },
              miniflare: {
                bindings: { TEST_MIGRATIONS: migrations }
              }
            })
          ],
          test: {
            name: "workers",
            include: ["src/**/*.test.ts"],
            setupFiles: ["./src/test/apply-migrations.ts"]
          }
        },
        {
          plugins: [react()],
          test: {
            name: "ui",
            environment: "node",
            include: ["src/**/*.test.tsx"]
          }
        }
      ]
    }
  };
});
