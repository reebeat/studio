// Client bundle sizes: each library's smallest browser entry, minified by `Bun.build`, plus the wasm modules. Output: `output/bundles.txt`.
import { readFileSync, statSync } from "node:fs";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const sizes = (bytes: Uint8Array): string =>
  `${bytes.length} B raw, ${gzipSync(bytes, { level: 9 }).length} B gzip -9, ${brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length} B brotli -q11`;

for (const entry of ["yjs", "am-slim", "am-full", "loro-web"]) {
  const result = await Bun.build({ entrypoints: [`bundle/${entry}.ts`], target: "browser", minify: true, external: ["*.wasm"] });
  if (!result.success) throw new Error(result.logs.join("\n"));
  const js = result.outputs.find((o) => o.kind === "entry-point");
  console.log(`${entry}.js: ${sizes(new Uint8Array(await js!.arrayBuffer()))}`);
}
for (const wasm of ["node_modules/@automerge/automerge/dist/automerge.wasm", "node_modules/loro-crdt/web/loro_wasm_bg.wasm"]) {
  console.log(`${wasm.split("/").at(-1)} (${statSync(wasm).size} B on disk): ${sizes(readFileSync(wasm))}`);
}
