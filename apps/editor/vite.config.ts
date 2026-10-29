// Generated app config from `create-foldkit-app` 0.40.0 (counter example), moved onto Vite+: `defineConfig` comes from
// `vite-plus` and the Vitest options live in the `test` block (Vite+ bundles Vitest).
// Deviation: no `@foldkit/vite-plugin`. Release 0.28.0 pins effect 4.0.0 and imports `Crypto` from the `effect` root,
// which effect 4.1.0 no longer exports, so Vite cannot even load this file with it (spec 0000, Revisions 2026-10-29).
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  optimizeDeps: { entries: ["src/entry.ts"] },
  plugins: [tailwindcss()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    server: { deps: { inline: ["foldkit", "@foldkit/ui"] } },
    setupFiles: ["./src/vitestSetup.ts"],
  },
});
