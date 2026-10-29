// Sizes and timings: encoded document size against the JSON it holds, load and materialise time, history growth under
// many small edits, and merge time for two diverged replicas. Run once on the real story and once on a scaled one.
import { brotliCompressSync, gzipSync } from "node:zlib";
import { libs, makeDoc, type Doc, type Json, type Lib } from "./doc.ts";
import { baseIr } from "./ir.ts";
import { keyed, mapRefs, models, naive, type Model } from "./model.ts";
import { mulberry32, randomOp } from "./determinism.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ms = (t0: number): number => Math.round((performance.now() - t0) * 100) / 100;
const kib = (n: number): string => (n / 1024).toFixed(1);

/** The real story repeated `copies` times with every id suffixed, so that identity stays unique story-wide. */
export const scaleIr = (ir: any, copies: number): Json => {
  const scenes: any[] = [];
  const chapters: any[] = [];
  for (let i = 0; i < copies; i += 1) {
    const s = (id: string): string => `${id}-${i}`;
    for (const c of ir.chapters) chapters.push({ ...clone(c), id: s(c.id), sceneIds: c.sceneIds.map(s) });
    for (const sc of ir.scenes) {
      const next = clone(sc);
      next.id = s(sc.id);
      next.chapterId = s(sc.chapterId);
      next.elements.forEach((e: any) => (e.id = s(e.id)));
      next.effects.forEach((e: any) => {
        if (e.target) e.target = s(e.target);
        e.when = mapRefs(e.when, (k, v) => (k === "element" ? s(v) : v));
        if (e.until) e.until = { ...e.until, event: mapRefs(e.until.event, (k, v) => (k === "element" ? s(v) : v)) };
      });
      next.events.forEach((e: any) => (e.event = mapRefs(e.event, (k, v) => (k === "element" ? s(v) : v))));
      next.lines.forEach((l: any, li: number) => (l.id = `${next.id}.l${li + 1}`));
      scenes.push(next);
    }
  }
  return { ...ir, chapters, scenes };
};

const bytes = (b: Uint8Array): { raw: number; gzip: number; brotli: number } => ({
  raw: b.length,
  gzip: gzipSync(b).length,
  brotli: brotliCompressSync(b).length,
});

interface SizeRow {
  readonly lib: Lib;
  readonly model: string;
  readonly jsonBytes: number;
  readonly saveBytes: number;
  readonly saveGzip: number;
  readonly saveBrotli: number;
  readonly ratio: number;
  readonly buildMs: number;
  readonly loadMs: number;
  readonly materialiseMs: number;
  readonly viewMs: number;
}

const measureSize = (lib: Lib, m: Model, ir: Json): SizeRow => {
  const seeded = m.seed(ir);
  const jsonBytes = Buffer.byteLength(JSON.stringify(seeded));
  const t0 = performance.now();
  const p = m.open(lib, 1, ir);
  const buildMs = ms(t0);
  const save = p.doc.save();
  const t1 = performance.now();
  const loaded = makeDoc(lib, 2);
  loaded.applyUpdate(save);
  const loadMs = ms(t1);
  const t2 = performance.now();
  const json = loaded.json();
  const materialiseMs = ms(t2);
  const t3 = performance.now();
  m.view(json);
  const viewMs = ms(t3);
  const b = bytes(save);
  return { lib, model: m.name, jsonBytes, saveBytes: b.raw, saveGzip: b.gzip, saveBrotli: b.brotli, ratio: b.raw / jsonBytes, buildMs, loadMs, materialiseMs, viewMs };
};

/** `edits` random single-field edits by one peer: the save size and the time per edit as the history grows. */
const history = (lib: Lib, m: Model, ir: Json, edits: number): { checkpoints: { edits: number; save: number; stateOnly: number | null }[]; msPerEdit: number } => {
  const p = m.open(lib, 1, ir);
  const rnd = mulberry32(42);
  const checkpoints: { edits: number; save: number; stateOnly: number | null }[] = [];
  let done = 0;
  const t0 = performance.now();
  while (done < edits) {
    const view = m.view(p.json());
    // only field edits, so the document does not grow by itself: the growth measured is history
    const sc = view.scenes[Math.floor(rnd() * view.scenes.length)];
    const el = sc.elements[Math.floor(rnd() * sc.elements.length)];
    if (el === undefined) continue;
    m.setElementProp(p, sc.id, el.id, rnd() < 0.5 ? "text" : "class", rnd() < 0.5 ? `t${done}` : ["box", "title", "label", "accent", "muted"][done % 5]!);
    p.doc.commit();
    done += 1;
    if (done === 1 || done === 100 || done === 1000 || done === edits)
      checkpoints.push({ edits: done, save: p.doc.save().length, stateOnly: stateOnly(p.doc) });
  }
  return { checkpoints, msPerEdit: Math.round(((performance.now() - t0) / edits) * 1000) / 1000 };
};

/** The size of the current state with its history dropped, where the library has a way to say it. */
const stateOnly = (doc: Doc): number | null => {
  const anyDoc = doc as unknown as { doc: any };
  if (doc.lib === "loro") return anyDoc.doc.export({ mode: "shallow-snapshot", frontiers: anyDoc.doc.frontiers() }).length;
  if (doc.lib === "yjs") return doc.save().length; // gc is on: deleted content is already dropped from the update
  return null;
};

const mergeTime = (lib: Lib, m: Model, ir: Json, opsEach: number): { ms: number; bytes: number } => {
  const origin = m.open(lib, 1, ir);
  const a = origin.fork(2);
  const b = origin.fork(3);
  const ra = mulberry32(1);
  const rb = mulberry32(2);
  let n = 0;
  while (n < opsEach) if (randomOp(m, a, ra, "a")) n += 1;
  n = 0;
  while (n < opsEach) if (randomOp(m, b, rb, "b")) n += 1;
  a.doc.commit();
  b.doc.commit();
  const update = b.doc.updateSince(origin.doc.version());
  const t0 = performance.now();
  a.doc.merge(b.doc);
  return { ms: ms(t0), bytes: update.length };
};

if (import.meta.main) {
  const real = baseIr();
  const big = scaleIr(real, 30);
  for (const [label, ir] of [["real story (7 scenes)", real], ["scaled story (210 scenes)", big]] as const) {
    console.log(`\n### ${label}`);
    console.log("model lib       json KiB | save KiB gzip KiB brotli KiB (x json) | build ms load ms json() ms view ms");
    for (const m of models)
      for (const lib of libs) {
        const r = measureSize(lib, m, ir);
        console.log(
          `${r.model.padEnd(5)} ${r.lib.padEnd(9)} ${kib(r.jsonBytes).padStart(7)} | ${kib(r.saveBytes).padStart(7)} ${kib(r.saveGzip).padStart(7)} ${kib(r.saveBrotli).padStart(8)} (${r.ratio.toFixed(2)}x) | ${String(r.buildMs).padStart(7)} ${String(r.loadMs).padStart(7)} ${String(r.materialiseMs).padStart(7)} ${String(r.viewMs).padStart(7)}`
        );
      }
  }
  console.log("\n### history growth: 5000 single-field edits on the real story (keyed model)");
  for (const lib of libs) {
    const h = history(lib, keyed, real, 5000);
    console.log(
      `${lib.padEnd(9)} ${h.checkpoints.map((c) => `${c.edits}: ${kib(c.save)} KiB${c.stateOnly === null ? "" : ` (state only ${kib(c.stateOnly)})`}`).join(" | ")} | ${h.msPerEdit} ms/edit`
    );
  }
  console.log("\n### merge: replica a imports 300 random ops of replica b (scaled story, keyed model)");
  for (const lib of libs) {
    const r = mergeTime(lib, keyed, big, 300);
    console.log(`${lib.padEnd(9)} merge ${r.ms} ms, update ${kib(r.bytes)} KiB`);
  }
  void naive;
}
