// Three ways to deal with a merged document that breaks an IR invariant, measured on the same cases:
//   as-merged  nothing: the document is what the CRDT produced (the baseline the other two are compared with)
//   repair     a pure function of the merged IR that restores the invariants (every peer computes the same result)
//   reject     a server applies each peer's changes to its own replica and refuses a change that makes the IR invalid
// Plus the id strategy ("keyed": uid keys and references by uid) which the `keyed` model already implements.
import { sync, type Json } from "./doc.ts";
import { canon } from "./canon.ts";
import { baseIr, validate } from "./ir.ts";
import { keyedView, type Model } from "./model.ts";
import { cases, runCase, type Outcome } from "./cases.ts";
import { libs } from "./doc.ts";
import { models } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const refsOf = (expr: any, out: { element: string[]; effect: string[]; event: string[] } = { element: [], effect: [], event: [] }) => {
  if (Array.isArray(expr)) expr.forEach((x) => refsOf(x, out));
  else if (expr && typeof expr === "object") {
    const s = expr.subject;
    if (s && (s.kind === "element" || s.kind === "effect")) out[s.kind as "element" | "effect"].push(s.id);
    if (expr.kind === "ref") out.event.push(expr.name);
    for (const [k, v] of Object.entries(expr)) if (k !== "subject") refsOf(v, out);
  }
  return out;
};

/** The repair, applied to one merged IR. Returns the repaired IR and what it did. */
export const repair = (input: Json): { readonly ir: Json; readonly actions: readonly string[] } => {
  const ir = clone(input) as Obj;
  const actions: string[] = [];
  // Scenes: keep the first of equal ids; chapter.sceneIds is derived from the scene order, never trusted.
  const seen = new Set<string>();
  ir.scenes = ir.scenes.filter((s: Obj) => {
    if (seen.has(s.id)) {
      actions.push(`drop duplicate scene ${s.id}`);
      return false;
    }
    seen.add(s.id);
    return true;
  });
  for (const c of ir.chapters) c.sceneIds = ir.scenes.filter((s: Obj) => s.chapterId === c.id).map((s: Obj) => s.id);
  for (const s of ir.scenes) {
    // Duplicate names: the later one gets a suffix.
    const rename = (items: Obj[], key: string, taken: Set<string>, what: string): void => {
      for (const it of items) {
        let name = it[key] as string;
        let n = 1;
        while (taken.has(name)) name = `${it[key]}~${(n += 1)}`;
        if (name !== it[key]) actions.push(`rename duplicate ${what} ${s.id}/${it[key]} to ${name}`);
        it[key] = name;
        taken.add(name);
      }
    };
    rename(s.elements, "id", new Set(), "element");
    const names = new Set<string>();
    rename(s.effects, "id", names, "effect");
    rename(s.events, "name", names, "event");
    // Curves: sort by t, drop a later point with a t already taken.
    for (const e of s.elements)
      for (const [cn, pts] of Object.entries((e.curves ?? {}) as Obj)) {
        const sorted = [...(pts as Obj[])].sort((a, b) => a.t - b.t);
        const kept = sorted.filter((p, i) => i === 0 || p.t > sorted[i - 1].t);
        if (kept.length !== sorted.length || canon(kept) !== canon(pts)) actions.push(`normalise curve ${s.id}/${e.id}.${cn}`);
        e.curves[cn] = kept;
      }
    // Dangling references, to a fixed point: drop what depends on a thing that is not there; cycles: drop the last event of the cycle.
    let changed = true;
    while (changed) {
      changed = false;
      const el = new Set(s.elements.map((e: Obj) => e.id));
      const fx = new Set(s.effects.map((e: Obj) => e.id));
      const ev = new Set(s.events.map((e: Obj) => e.name));
      const bad = (x: Obj): boolean => {
        const r = refsOf([x.when, x.until, x.event]);
        return r.element.some((n) => !el.has(n)) || r.effect.some((n) => !fx.has(n)) || r.event.some((n) => !ev.has(n));
      };
      const before = s.effects.length + s.events.length;
      s.effects = s.effects.filter((e: Obj) => {
        const dead = (e.target !== undefined && !el.has(e.target)) || bad(e);
        if (dead) actions.push(`drop effect ${s.id}/${e.id} (dangling reference)`);
        return !dead;
      });
      s.events = s.events.filter((e: Obj) => {
        const dead = bad(e);
        if (dead) actions.push(`drop event ${s.id}/${e.name} (dangling reference)`);
        return !dead;
      });
      if (s.effects.length + s.events.length !== before) changed = true;
      // cycle among events
      const deps = new Map<string, string[]>(s.events.map((e: Obj) => [e.name, refsOf(e.event).event]));
      const visit = (n: string, path: string[]): string[] | undefined => {
        if (path.includes(n)) return path.slice(path.indexOf(n));
        for (const m of deps.get(n) ?? []) {
          const c = visit(m, [...path, n]);
          if (c) return c;
        }
        return undefined;
      };
      for (const n of deps.keys()) {
        const cycle = visit(n, []);
        if (cycle) {
          const victim = [...cycle].sort().at(-1)!;
          s.events = s.events.filter((e: Obj) => e.name !== victim);
          actions.push(`break cycle ${cycle.join("->")} by dropping event ${victim}`);
          changed = true;
          break;
        }
      }
    }
  }
  return { ir: ir as Json, actions };
};

export interface Strategies {
  readonly case: string;
  readonly model: string;
  readonly lib: string;
  readonly asMerged: boolean;
  readonly repaired: boolean;
  readonly repairActions: readonly string[];
  /** Reject at the server: which edit is refused when A arrives first / when B arrives first (null: both accepted). */
  readonly rejectAFirst: "A" | "B" | null;
  readonly rejectBFirst: "A" | "B" | null;
  /** After rejection, is the server's document valid (it always is by construction) and did it keep both edits? */
  readonly bothKept: boolean;
}

/** A server replica that takes each peer's whole replica as one change and refuses it if the IR becomes invalid. */
const gate = (c: (typeof cases)[number], m: Model, lib: Outcome["lib"], first: "A" | "B"): "A" | "B" | null => {
  const origin = m.open(lib, 1, baseIr());
  const a = origin.fork(2);
  const b = origin.fork(3);
  c.a(m, a);
  c.b(m, b);
  const server = origin.fork(4);
  let refused: "A" | "B" | null = null;
  for (const who of first === "A" ? (["A", "B"] as const) : (["B", "A"] as const)) {
    const trial = server.fork(5);
    trial.doc.merge((who === "A" ? a : b).doc);
    if (validate(m.view(trial.json())).ok) server.doc.merge((who === "A" ? a : b).doc);
    else refused = who;
  }
  return refused;
};

export const runStrategies = (): Strategies[] => {
  const out: Strategies[] = [];
  for (const c of cases)
    for (const m of models)
      for (const lib of libs) {
        const o = runCase(c, m, lib);
        const origin = m.open(lib, 1, baseIr());
        const a = origin.fork(2);
        const b = origin.fork(3);
        c.a(m, a);
        c.b(m, b);
        sync(a.doc, b.doc);
        const r = repair(m.name === "keyed" ? keyedView(a.json(), true) : m.view(a.json()));
        const ra = gate(c, m, lib, "A");
        const rb = gate(c, m, lib, "B");
        out.push({
          case: c.id,
          model: m.name,
          lib,
          asMerged: o.valid,
          repaired: validate(r.ir).ok,
          repairActions: r.actions,
          rejectAFirst: ra,
          rejectBFirst: rb,
          bothKept: ra === null && rb === null,
        });
      }
  return out;
};

if (import.meta.main) {
  const rows = runStrategies();
  for (const c of cases) {
    console.log(`\n== ${c.id}: ${c.title}`);
    for (const r of rows.filter((x) => x.case === c.id))
      console.log(
        `  ${r.model.padEnd(5)} ${r.lib.padEnd(9)} merged:${r.asMerged ? "valid  " : "INVALID"} repaired:${r.repaired ? "valid  " : "INVALID"} reject(A first)->${r.rejectAFirst ?? "-"} reject(B first)->${r.rejectBFirst ?? "-"}  ${r.repairActions.join("; ").slice(0, 150)}`
      );
  }
}
