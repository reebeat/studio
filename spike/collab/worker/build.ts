// Bundles each worker for workerd: one ES module, the wasm left as a separate module next to it.
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const wasmFiles: string[] = [];
for (const lib of ["yjs", "automerge", "loro"]) {
  const out = resolve("worker/out", lib);
  mkdirSync(out, { recursive: true });
  const result = await Bun.build({
    entrypoints: [resolve("worker", `${lib}.ts`)],
    outdir: out,
    naming: "worker.js",
    target: "browser",
    format: "esm",
    minify: true,
    conditions: ["workerd", "worker", "browser"],
    external: ["cloudflare:workers"],
    plugins: [
      {
        name: "wasm-external",
        setup(b) {
          b.onResolve({ filter: /\.wasm$/ }, (args) => {
            const path = args.path.startsWith(".") ? resolve(args.resolveDir, args.path) : require.resolve(args.path);
            copyFileSync(path, resolve(out, basename(path)));
            wasmFiles.push(`${lib}: ${basename(path)} ${statSync(path).size}`);
            return { path: `./${basename(path)}`, external: true };
          });
        },
      },
    ],
  });
  if (!result.success) throw new Error(result.logs.join("\n"));
  // Bun keeps the original specifier of an external: point it at the copy next to the bundle.
  const text = readFileSync(resolve(out, "worker.js"), "utf8").replace(/from"[^"]*?([^\/"]+\.wasm)"/g, (_m, name: string) => `from"./${name}"`);
  writeFileSync(resolve(out, "worker.js"), text);
  const js = readFileSync(resolve(out, "worker.js"));
  console.log(`${lib}: worker.js ${js.length} B raw, ${gzipSync(js).length} B gzip`);
}
console.log(wasmFiles.join("\n"));
