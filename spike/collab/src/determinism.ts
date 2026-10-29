// Determinism: do replicas that applied the same set of changes, in different orders, end byte-identical?
// Three peers make random editor operations in rounds with random gossip in between (so changes are concurrent and
// causally nested); every change is recorded as the library's own incremental update. The updates are then replayed
// into fresh replicas in random orders (the libraries buffer a change whose causes have not arrived).
// Compared per library and model, over many seeds and orders:
//   raw       JSON.stringify of the library's own JSON output (key order as the library produced it)
//   canonical the same with keys sorted
//   ir        the IR text written by 0004's `jsonCodec` (schema key order), when the document decodes
//   binary    the library's full-save bytes
import { libs, makeDoc, sync, type Doc, type Json, type Lib } from "./doc.ts";
import { canon } from "./canon.ts";
import { baseIr, irText } from "./ir.ts";
import { models, type Model, type Peer } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const classes = ["box", "title", "label", "accent", "muted"];
const cells = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"];

/** One random editor operation, chosen against the peer's current view. Returns false when nothing applied. */
export const randomOp = (m: Model, p: Peer, rnd: () => number, tag: string): boolean => {
  const view = m.view(p.json());
  const scene = pick(rnd, view.scenes) as any;
  const element = scene.elements.length > 0 ? (pick(rnd, scene.elements) as any) : undefined;
  const n = Math.floor(rnd() * 10);
  try {
    switch (n) {
      case 0:
      case 1:
        if (!element) return false;
        m.setElementProp(p, scene.id, element.id, "class", pick(rnd, classes));
        return true;
      case 2:
        if (!element) return false;
        m.setElementProp(p, scene.id, element.id, "cell", pick(rnd, cells));
        return true;
      case 3:
        if (!element) return false;
        m.setElementProp(p, scene.id, element.id, "text", `${tag}-${Math.floor(rnd() * 1000)}`);
        return true;
      case 4:
        m.addEffect(p, scene.id, Math.floor(rnd() * (scene.effects.length + 1)), {
          id: `${tag}-${Math.floor(rnd() * 1e6)}`,
          line: 1,
          verb: "sound",
          name: "pop",
          when: { absoluteFlicks: Math.floor(rnd() * 1e9), reason: "r" },
          written: "x",
        });
        return true;
      case 5:
        if (!element) return false;
        m.renameElement(p, element.id, `${tag}${Math.floor(rnd() * 1e6)}`);
        return true;
      case 6: {
        const ids = view.scenes.map((s: any) => s.id);
        m.moveScene(p, pick(rnd, ids), Math.floor(rnd() * ids.length));
        return true;
      }
      case 7: {
        const sc4 = view.scenes.find((s: any) => s.id === "sc4");
        const one = sc4?.elements.find((e: any) => e.id === "one" || e.curves);
        if (!one?.curves) return false;
        m.insertPoint(p, "sc4", one.id, "opacity", { t: Math.round(rnd() * 1000) / 1000, v: Math.round(rnd() * 1000) / 1000 });
        return true;
      }
      case 8: {
        const sc4 = view.scenes.find((s: any) => s.id === "sc4");
        const one = sc4?.elements.find((e: any) => e.curves);
        if (!one) return false;
        const pts = one.curves.opacity;
        m.setPointField(p, "sc4", one.id, "opacity", Math.floor(rnd() * pts.length), pick(rnd, ["t", "v"] as const), Math.round(rnd() * 1000) / 1000);
        return true;
      }
      default:
        if (!element || scene.effects.length === 0) return false;
        m.deleteElement(p, scene.id, element.id);
        return true;
    }
  } catch {
    return false;
  }
};

export interface Run {
  readonly updates: Uint8Array[];
  readonly final: Doc;
  readonly baseSave: Uint8Array;
  readonly ops: number;
}

/** Three peers, rounds of local edits, random one-way gossip, then full sync. Records every peer's incremental updates. */
export const gossip = (m: Model, lib: Lib, seed: number, rounds = 8, opsPerRound = 6): Run => {
  const rnd = mulberry32(seed);
  const origin = m.open(lib, 1, baseIr());
  const baseSave = origin.doc.save();
  const peers: Peer[] = [origin.fork(10), origin.fork(20), origin.fork(30)];
  const marks = peers.map((p) => p.doc.version());
  const updates: Uint8Array[] = [];
  let ops = 0;
  for (let r = 0; r < rounds; r += 1) {
    peers.forEach((p, i) => {
      for (let k = 0; k < opsPerRound; k += 1) if (randomOp(m, p, rnd, `p${i}r${r}`)) ops += 1;
      p.doc.commit({ message: `p${i}r${r}` });
      updates.push(p.doc.updateSince(marks[i]));
      marks[i] = p.doc.version();
    });
    // random one-way gossip: the receiver's new state is captured again as its own update only for its own ops, so
    // gossip changes nothing about the recorded update set (every change is recorded by its author).
    const [x, y] = [pick(rnd, peers), pick(rnd, peers)];
    if (x !== y) {
      x.doc.merge(y.doc);
      marks[peers.indexOf(x)] = x.doc.version();
    }
  }
  for (const p of peers.slice(1)) sync(peers[0]!.doc, p.doc);
  sync(peers[0]!.doc, peers[1]!.doc);
  return { updates, final: peers[0]!.doc, baseSave, ops };
};

const fresh = (_m: Model, lib: Lib, run: Run, order: readonly number[]): Doc => {
  // an empty replica; the base state is the origin's save, the same for everyone, then the updates in the given order
  const d = makeDoc(lib, 99);
  d.applyUpdate(run.baseSave);
  for (const i of order) d.applyUpdate(run.updates[i]!);
  return d;
};

const shuffle = <T>(rnd: () => number, xs: readonly T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

export interface Row {
  readonly lib: Lib;
  readonly model: string;
  readonly replays: number;
  readonly ops: number;
  readonly equalsGossip: number;
  readonly rawDistinct: number;
  readonly canonDistinct: number;
  readonly irDistinct: number;
  readonly irUndecodable: number;
  readonly binaryDistinct: number;
  readonly errors: number;
}

export const measure = (lib: Lib, m: Model, seeds: number, perms: number): Row => {
  let replays = 0;
  let ops = 0;
  let equalsGossip = 0;
  let rawDistinct = 0;
  let canonDistinct = 0;
  let irDistinct = 0;
  let irUndecodable = 0;
  let binaryDistinct = 0;
  let errors = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const run = gossip(m, lib, seed);
    ops += run.ops;
    const rnd = mulberry32(seed * 7919);
    const raw = new Set<string>();
    const can = new Set<string>();
    const ir = new Set<string>();
    const bin = new Set<string>();
    const gossipCanon = canon(m.view(run.final.json() as Json));
    for (let k = 0; k < perms; k += 1) {
      const order = shuffle(rnd, run.updates.map((_, i) => i));
      try {
        const d = fresh(m, lib, run, order);
        const view = m.view(d.json());
        raw.add(JSON.stringify(view));
        can.add(canon(view));
        const text = irText(view as Json);
        if (text === undefined) irUndecodable += 1;
        else ir.add(text);
        bin.add(hex(d.save()));
        if (canon(view) === gossipCanon) equalsGossip += 1;
        replays += 1;
      } catch {
        errors += 1;
      }
    }
    rawDistinct += raw.size - 1;
    canonDistinct += can.size - 1;
    irDistinct += Math.max(0, ir.size - 1);
    binaryDistinct += bin.size - 1;
  }
  return { lib, model: m.name, replays, ops, equalsGossip, rawDistinct, canonDistinct, irDistinct, irUndecodable, binaryDistinct, errors };
};

/** sha256 of the raw (un-canonicalised) JSON text of the converged document, per library and model, for seeds 1..3. */
export const digests = async (): Promise<string[]> => {
  const out: string[] = [];
  for (const m of models)
    for (const lib of libs)
      for (const seed of [1, 2, 3]) {
        const run = gossip(m, lib, seed);
        const raw = JSON.stringify(m.view(run.final.json()));
        const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        out.push(`${m.name} ${lib} seed=${seed} raw=${Buffer.from(h).toString("hex").slice(0, 16)}`);
      }
  return out;
};

if (import.meta.main && process.argv[2] === "digest") {
  for (const line of await digests()) console.log(line);
} else if (import.meta.main) {
  const seeds = Number(process.argv[2] ?? 10);
  const perms = Number(process.argv[3] ?? 20);
  console.log(`seeds=${seeds} orders/seed=${perms}; "distinct" = extra distinct outputs beyond the first, summed over seeds (0 = byte-identical)`);
  for (const m of models)
    for (const lib of libs) {
      const r = measure(lib, m, seeds, perms);
      console.log(
        `${m.name.padEnd(5)} ${lib.padEnd(9)} replays=${r.replays} ops=${r.ops} equal-to-gossip=${r.equalsGossip}/${r.replays} rawDistinct=${r.rawDistinct} canonDistinct=${r.canonDistinct} irDistinct=${r.irDistinct} (undecodable ${r.irUndecodable}) binaryDistinct=${r.binaryDistinct} errors=${r.errors}`
      );
    }
}
