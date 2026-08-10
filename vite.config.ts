import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import agents from "agents/vite";

/**
 * The `ai` binding is dropped in serve mode so `npm run dev` needs no
 * CLOUDFLARE_API_TOKEN.
 *
 * Workers AI has no local simulation — `remote: false` is rejected outright,
 * and omitting `remote` connects to the real service anyway. So there is no
 * "run it locally" state to reach: the only way to boot the dev server without
 * credentials is to not declare the binding at all.
 *
 * `command === "serve"` covers `vite dev` and `vite preview`. `vite build` is
 * untouched, so the deployed `dist/pml/wrangler.json` still carries `ai` —
 * there is a test pinning exactly that, because silently shipping a Worker
 * with no AI binding is the obvious way for this to go wrong.
 *
 * The mutating-function form is required: the plugin merges configuration with
 * `defu`, so an override object can add or replace a key but never delete one.
 *
 * Anyone who needs the real AI path puts CLOUDFLARE_API_TOKEN in `.env`
 * (gitignored) — see README.
 */
export default defineConfig(({ command }) => ({
  plugins: [
    agents(),
    react(),
    cloudflare(
      command === "serve"
        ? {
            config: (config) => {
              delete config.ai;
            }
          }
        : undefined
    ),
    tailwindcss()
  ]
}));
