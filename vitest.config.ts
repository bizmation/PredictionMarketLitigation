import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

// Two projects, because the two kinds of code under test need different runtimes.
//
// "workers" — Worker/Agent/Workflow code, run inside workerd against the real
//   wrangler.jsonc (architecture testing standard). agents() transforms the
//   @callable() decorators in agent classes, mirroring vite.config.ts.
//
// "ui" — presentational components from src/shared/ui. These cannot run in the
//   workers project: vitest-pool-workers externalizes `react`
//   (cloudflare/workers-sdk#10170). They need no DOM either — assertions go
//   through renderToStaticMarkup — so environment is plain node rather than
//   jsdom, which keeps jsdom out of the dependency tree.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          agents(),
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" }
          })
        ],
        test: {
          name: "workers",
          include: ["src/**/*.test.ts"]
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
});
