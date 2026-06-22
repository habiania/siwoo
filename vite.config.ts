// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Force-enable nitro so `vite build` emits a deploy bundle.
  // - Cloudflare: emits a Worker (.output/) — used by the Cloudflare deploy.
  // - Vercel: nitro auto-detects the VERCEL env var and builds for Vercel.
  // maxDuration 60 (Vercel Hobby max): the sourcing pipeline fetches product
  // detail pages and runs several AI calls per run, so the default 10s is too short.
  nitro: {
    vercel: { functions: { maxDuration: 60 } },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
