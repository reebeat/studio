// Generated app config from `create-foldkit-app` 0.40.0 (counter example), moved onto Vite+: `defineConfig` comes from
// `vite-plus` and the Vitest options live in the `test` block (Vite+ bundles Vitest).
import { foldkit } from "@foldkit/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  optimizeDeps: { entries: ["src/entry.ts"] },
  plugins: [tailwindcss(), foldkit()],
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    server: { deps: { inline: ["foldkit", "@foldkit/ui"] } },
    setupFiles: ["./src/vitestSetup.ts"],
  },
});
