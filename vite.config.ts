import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import agents from "agents/vite";

/**
 * The `ai` binding is dropped in serve mode, UNLESS a CLOUDFLARE_API_TOKEN is
 * available, so `npm run dev` needs no token by default but a developer who
 * supplies one gets the real AI path automatically — no source edit needed.
 *
 * Workers AI has no local simulation — `remote: false` is rejected outright,
 * and omitting `remote` connects to the real service anyway. So there is no
 * "run it locally" state to reach: the only way to boot the dev server without
 * credentials is to not declare the binding at all.
 *
 * `command === "serve"` covers `vite dev` and `vite preview`. `vite build` is
 * always untouched regardless of a token, so the deployed `dist/pml/wrangler.json`
 * always carries `ai` — `wranglerConfig.test.tsx` pins exactly that, because
 * silently shipping a Worker with no AI binding is the obvious way for this
 * to go wrong.
 *
 * The mutating-function form is required: the plugin merges configuration with
 * `defu`, so an override object can add or replace a key but never delete one.
 *
 * `loadEnv` (not bare `process.env`) so a token in `.env` is picked up the
 * same way the rest of Vite's env handling works, without requiring it to
 * already be exported in the shell.
 */
export default defineConfig(({ command, mode }) => {
  const hasToken = Boolean(
    loadEnv(mode, process.cwd(), "").CLOUDFLARE_API_TOKEN
  );

  return {
    plugins: [
      agents(),
      react(),
      cloudflare(
        command === "serve" && !hasToken
          ? {
              config: (config) => {
                delete config.ai;
              }
            }
          : undefined
      ),
      tailwindcss()
    ]
  };
});
