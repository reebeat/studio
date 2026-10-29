// The negative controls and baselines quoted in spec 0002. Output: `output/controls.txt`.
//   1. the IR validator can fail (deleted Element, cycle, duplicate Element id, crossing curve)
//   2. two peers differ before a merge and are equal after it
//   3. a replay that withholds one update differs from the full one (determinism check can fail)
//   4. the size of the IR as JSON, gzip and brotli, and Yjs with garbage collection on and off
import { brotliCompressSync, gzipSync } from "node:zlib";
import { canon } from "./canon.ts";
import { libs, makeDoc, sync, yjsOptions } from "./doc.ts";
import { gossip } from "./determinism.ts";
import { baseIr, validate } from "./ir.ts";
import { keyed } from "./model.ts";
import { scaleIr } from "./sizes.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const short = (v: { ok: boolean; errors: readonly string[] }): string => `ok=${v.ok}${v.ok ? "" : ` [${[...new Set(v.errors.map((e) => e.split(":")[0]))].join(", ")}]`}`;

console.log("== 1. validator controls (real GraphSchema + validateScene + stand-in checks)");
const ir: any = baseIr();
console.log("unchanged story:", short(validate(ir)));
const noTag = clone(ir);
noTag.scenes[3].elements = noTag.scenes[3].elements.filter((e: any) => e.id !== "tag");
console.log("sc4 without Element tag, dependants kept:", short(validate(noTag)));
const cycle = clone(ir);
const eventNamed = (name: string): any => cycle.scenes[3].events.find((e: any) => e.name === name);
eventNamed("p").event = { kind: "shift", of: { kind: "ref", name: "q" }, offset: { unit: "flicks", value: 1 } };
eventNamed("q").event = { kind: "shift", of: { kind: "ref", name: "p" }, offset: { unit: "flicks", value: 1 } };
console.log("p anchored to q and q to p:", short(validate(cycle)));
const dup = clone(ir);
dup.scenes[3].elements.push({ ...dup.scenes[3].elements[0] });
console.log("duplicate Element id in sc4:", short(validate(dup)));
const curve = clone(ir);
curve.scenes[3].elements[0].curves.opacity[1].t = 0.8;
console.log("curve point crossing the next:", short(validate(curve)));

console.log("\n== 2. peers before and after a two-way merge (each made one edit)");
for (const lib of libs) {
  const origin = keyed.open(lib, 1, baseIr());
  const a = origin.fork(2);
  const b = origin.fork(3);
  keyed.setElementProp(a, "sc4", "one", "cell", "tl");
  keyed.setElementProp(b, "sc4", "hint", "text", "x");
  const before = canon(keyed.view(a.json())) === canon(keyed.view(b.json()));
  sync(a.doc, b.doc);
  console.log(`${lib}: equal before ${before}, equal after ${canon(keyed.view(a.json())) === canon(keyed.view(b.json()))}`);
}

console.log("\n== 3. replay with the last update withheld (seed 1, keyed)");
for (const lib of libs) {
  const run = gossip(keyed, lib, 1);
  const full = makeDoc(lib, 99);
  full.applyUpdate(run.baseSave);
  for (const u of run.updates) full.applyUpdate(u);
  const withheld = makeDoc(lib, 98);
  withheld.applyUpdate(run.baseSave);
  for (const u of run.updates.slice(0, -1)) withheld.applyUpdate(u);
  const gossiped = canon(keyed.view(run.final.json()));
  console.log(`${lib}: full replay equals gossiped state ${canon(keyed.view(full.json())) === gossiped}; replay missing the last update equals it ${canon(keyed.view(withheld.json())) === gossiped}`);
}

console.log("\n== 4. baselines");
for (const [name, story] of [["real story", baseIr()], ["scaled story (210 scenes)", scaleIr(baseIr(), 30)]] as const) {
  const bytes = Buffer.from(JSON.stringify(story));
  console.log(`${name}: JSON ${bytes.length} B, gzip ${gzipSync(bytes).length} B, brotli ${brotliCompressSync(bytes).length} B`);
}
for (const gc of [true, false]) {
  yjsOptions.gc = gc;
  const p = keyed.open("yjs", 1, baseIr());
  for (let i = 0; i < 5000; i += 1) keyed.setElementProp(p, "sc4", "one", "text", `t${i}`);
  console.log(`Yjs gc ${gc}: 5000 edits of one field, saved ${p.doc.save().length} B`);
}
