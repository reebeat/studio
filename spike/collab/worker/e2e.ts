// End to end on workerd (Miniflare 4): two clients edit the story concurrently through a sync room that is a Durable
// Object (WebSocket hibernation, SQLite update log); they converge on a valid IR; the object is then thrown away and
// started again from its SQLite file, and a third client joins and reads the same document.
// Run under Node: node --experimental-transform-types worker/e2e.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare } from "miniflare";
import { makeDoc, type Doc, type Lib } from "../src/doc.ts";
import { canon } from "../src/canon.ts";
import { baseIr, validate } from "../src/ir.ts";
import { keyed } from "../src/model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const start = (lib: Lib, persist: string): Miniflare =>
  new Miniflare({
    modules: true,
    scriptPath: resolve("worker/out", lib, "worker.js"),
    modulesRoot: resolve("worker/out", lib),
    modulesRules: [{ type: "CompiledWasm", include: ["**/*.wasm"] }],
    compatibilityDate: "2026-05-01",
    durableObjects: { ROOM: { className: "Room", useSQLite: true } },
    durableObjectsPersist: join(persist, "do"),
    port: 0,
    host: "127.0.0.1",
  });

interface Client {
  readonly doc: Doc;
  readonly received: { n: number; bytes: number };
  send(bytes: Uint8Array): void;
  close(): void;
}

const connect = async (mf: Miniflare, doc: Doc, room: string): Promise<Client> => {
  const url = (await mf.ready).toString().replace("http", "ws").replace(/\/$/, "") + room;
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  const received = { n: 0, bytes: 0 };
  ws.onmessage = (e) => {
    const bytes = new Uint8Array(e.data as ArrayBuffer);
    received.n += 1;
    received.bytes += bytes.length;
    doc.applyUpdate(bytes);
  };
  await new Promise<void>((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error("websocket error"));
  });
  return { doc, received, send: (b) => ws.send(b), close: () => ws.close() };
};

const settle = async (a: () => string, b: () => string): Promise<boolean> => {
  for (let i = 0; i < 40; i += 1) {
    if (a() === b()) return true;
    await sleep(50);
  }
  return a() === b();
};

const run = async (lib: Lib): Promise<void> => {
  const persist = mkdtempSync(join(tmpdir(), "collab-do-"));
  let mf = start(lib, persist);
  const t0 = performance.now();
  try {
    // A seeds the story and uploads it
    const a = keyed.open(lib, 2, baseIr());
    const ca = await connect(mf, a.doc, "/room/story");
    const seed = a.doc.save();
    ca.send(seed);
    await sleep(200);
    const coldMs = Math.round(performance.now() - t0);
    // B joins an empty replica and gets the snapshot
    const bDoc = makeDoc(lib, 3);
    const cb = await connect(mf, bDoc, "/room/story");
    await settle(() => canon(a.doc.json()), () => canon(bDoc.json()));
    const joined = canon(a.doc.json()) === canon(bDoc.json());
    // concurrent edits: case d1 (rename vs a new effect that targets the old name)
    const b = { doc: bDoc, json: () => bDoc.json(), uid: (p: string) => `${p}~3.${Math.random()}`, actor: 3 } as any;
    const va = a.doc.version();
    const vb = bDoc.version();
    keyed.renameElement(a, "one", "cube");
    keyed.addEffect(b, "sc4", 0, { id: "f9", line: 99, verb: "focus", target: "one", when: { absoluteFlicks: 1, reason: "b" }, written: "x" });
    ca.send(a.doc.updateSince(va));
    cb.send(bDoc.updateSince(vb));
    const converged = await settle(() => canon(a.doc.json()), () => canon(bDoc.json()));
    const view = keyed.view(a.doc.json());
    const verdict = validate(view);
    const stats = await (await mf.dispatchFetch("http://x/room/story")).json();
    ca.close();
    cb.close();
    // throw the object away and start it again from its SQLite file
    await mf.dispose();
    mf = start(lib, persist);
    const tJoin = performance.now();
    const cDoc = makeDoc(lib, 4);
    const cc = await connect(mf, cDoc, "/room/story");
    await settle(() => canon(a.doc.json()), () => canon(cDoc.json()));
    const joinMs = Math.round(performance.now() - tJoin);
    const persisted = canon(a.doc.json()) === canon(cDoc.json());
    const f9 = view.scenes[3].effects.find((e: any) => e.id === "f9");
    console.log(
      `${lib.padEnd(9)} cold start+seed ${coldMs} ms | B joined from snapshot: ${joined} | concurrent rename vs new effect: converged=${converged} valid=${verdict.ok} (f9 targets ${f9?.target}) | log ${JSON.stringify(stats.log)} | after restart from SQLite: join ${joinMs} ms (${cc.received.bytes} B), same document=${persisted}`
    );
    cc.close();
    // negative control: a room whose SQLite file is missing serves an empty document, so the check above can fail
    await mf.dispose();
    const empty = mkdtempSync(join(tmpdir(), "collab-do-empty-"));
    mf = start(lib, empty);
    const dDoc = makeDoc(lib, 5);
    const cd = await connect(mf, dDoc, "/room/story");
    await sleep(300);
    console.log(`${lib.padEnd(9)} control: restart without the SQLite file gives the same document: ${canon(a.doc.json()) === canon(dDoc.json())} (must be false)`);
    cd.close();
    rmSync(empty, { recursive: true, force: true });
  } finally {
    await mf.dispose();
    rmSync(persist, { recursive: true, force: true });
  }
};

for (const lib of ["yjs", "automerge", "loro"] as const) await run(lib);
process.exit(0);
