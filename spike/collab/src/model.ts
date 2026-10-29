// Two ways to put the IR into a CRDT document, and the editor operations on each.
//
//   naive  the IR's own shape: arrays of objects (elements, effects, derived events), ids as strings that other
//          objects reference by value. An edit addresses an item by its index in the replica's current array.
//   keyed  every array of identity-bearing objects becomes a map keyed by an immutable uid (order in a `pos` field);
//          a story-wide element identity is one registry entry whose `name` is the IR `id`; references hold the uid;
//          the IR is a pure projection (`view`) of the document.
//
// Operations are written as an editor would: each reads the replica's current view, then edits.
import { type Doc, type Json, type Lib, Atomic, atomic, makeDoc } from "./doc.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class Peer {
  private counter = 0;
  constructor(
    readonly doc: Doc,
    readonly actor: number
  ) {}
  fork(actor: number): Peer {
    return new Peer(this.doc.fork(actor), actor);
  }
  /** A new unique id: peer-local counter, so two peers never mint the same one. */
  uid(prefix: string): string {
    this.counter += 1;
    return `${prefix}~${this.actor}.${this.counter}`;
  }
  json(): any {
    return this.doc.json();
  }
}

// ---- references inside event expressions: element and effect subjects, derived-event refs ----

type RefKind = "element" | "effect" | "event";
export const mapRefs = (expr: any, f: (kind: RefKind, value: string) => string): any => {
  if (Array.isArray(expr)) return expr.map((x) => mapRefs(x, f));
  if (expr === null || typeof expr !== "object") return expr;
  const out: Obj = {};
  for (const [k, v] of Object.entries(expr)) {
    if (k === "subject" && v && typeof v === "object" && ((v as Obj).kind === "element" || (v as Obj).kind === "effect"))
      out[k] = { ...(v as Obj), id: f((v as Obj).kind, (v as Obj).id) };
    else out[k] = mapRefs(v, f);
  }
  if (out.kind === "ref" && typeof out.name === "string") out.name = f("event", out.name);
  return out;
};
const mentions = (expr: any, kind: RefKind, value: string): boolean => {
  let found = false;
  mapRefs(expr, (k, v) => {
    if (k === kind && v === value) found = true;
    return v;
  });
  return found;
};
const exprsOf = (item: Obj): any[] => [item.when, item.until, item.event].filter((x) => x !== undefined);

export interface Model {
  readonly name: "naive" | "keyed";
  seed(ir: Json): Json;
  view(doc: any): any;
  open(lib: Lib, actor: number, ir: Json): Peer;
  setElementProp(p: Peer, scene: string, el: string, prop: string, value: Json | Atomic): void;
  deleteElement(p: Peer, scene: string, el: string): void;
  addEffect(p: Peer, scene: string, index: number, effect: Obj): void;
  addEvent(p: Peer, scene: string, event: Obj): void;
  setEventExpr(p: Peer, scene: string, name: string, expr: any): void;
  renameElement(p: Peer, from: string, to: string): void;
  setPointField(p: Peer, scene: string, el: string, curve: string, index: number, field: "t" | "v", value: number): void;
  insertPoint(p: Peer, scene: string, el: string, curve: string, point: { t: number; v: number }): void;
  moveScene(p: Peer, id: string, to: number): void;
  replaceElement(p: Peer, scene: string, el: string, record: Obj): void;
}

const sceneIdx = (view: any, scene: string): number => view.scenes.findIndex((s: Obj) => s.id === scene);
const byName = (xs: Obj[], key: string, name: string): number => xs.findIndex((x) => x[key] === name);

// ================================================================================================= naive

export const naive: Model = {
  name: "naive",
  seed: (ir) => clone(ir),
  view: (doc) => doc,
  open: (lib, actor, ir) => new Peer(makeDoc(lib, actor, ir), actor),
  setElementProp(p, scene, el, prop, value) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    const ei = byName(v.scenes[si].elements, "id", el);
    p.doc.put(["scenes", si, "elements", ei, ...prop.split(".")], value);
  },
  deleteElement(p, scene, el) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    const s = v.scenes[si];
    const dead = cascade(s, (x) => mentions(x, "element", el), (item) => item.target === el, "id", "name");
    for (const idx of dead.effects.toReversed()) p.doc.remove(["scenes", si, "effects", idx]);
    for (const idx of dead.events.toReversed()) p.doc.remove(["scenes", si, "events", idx]);
    p.doc.remove(["scenes", si, "elements", byName(s.elements, "id", el)]);
  },
  addEffect(p, scene, index, effect) {
    p.doc.insert(["scenes", sceneIdx(p.json(), scene), "effects"], index, effect);
  },
  addEvent(p, scene, event) {
    const si = sceneIdx(p.json(), scene);
    p.doc.insert(["scenes", si, "events"], p.json().scenes[si].events.length, event);
  },
  setEventExpr(p, scene, name, expr) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    p.doc.put(["scenes", si, "events", byName(v.scenes[si].events, "name", name), "event"], expr);
  },
  renameElement(p, from, to) {
    // The editor rewrites every place the local replica shows the old id, in every scene.
    const v = p.json();
    v.scenes.forEach((s: Obj, si: number) => {
      s.elements.forEach((e: Obj, ei: number) => {
        if (e.id === from) p.doc.put(["scenes", si, "elements", ei, "id"], to);
      });
      const rewrite = (path: (string | number)[], expr: any): void => {
        const next = mapRefs(expr, (k, val) => (k === "element" && val === from ? to : val));
        if (JSON.stringify(next) !== JSON.stringify(expr)) p.doc.put(path, next);
      };
      s.effects.forEach((e: Obj, i: number) => {
        if (e.target === from) p.doc.put(["scenes", si, "effects", i, "target"], to);
        if (e.when?.event) rewrite(["scenes", si, "effects", i, "when", "event"], e.when.event);
        if (e.until?.event) rewrite(["scenes", si, "effects", i, "until", "event"], e.until.event);
      });
      s.events.forEach((e: Obj, i: number) => rewrite(["scenes", si, "events", i, "event"], e.event));
    });
  },
  setPointField(p, scene, el, curve, index, field, value) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    const ei = byName(v.scenes[si].elements, "id", el);
    p.doc.put(["scenes", si, "elements", ei, "curves", curve, index, field], value);
  },
  moveScene(p, id, to) {
    const v = p.json();
    const from = sceneIdx(v, id);
    p.doc.move(["scenes"], from, to);
    // `chapter.sceneIds` repeats the order of the scenes, so the editor moves the id in its chapter as well.
    const chapters: Obj[] = v.chapters;
    const ci = chapters.findIndex((c) => (c.sceneIds as string[]).includes(id));
    const ids: string[] = chapters[ci]!.sceneIds;
    const target = v.scenes[to].id as string;
    p.doc.move(["chapters", ci, "sceneIds"], ids.indexOf(id), ids.includes(target) ? ids.indexOf(target) : ids.length - 1);
  },
  replaceElement(p, scene, el, record) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    p.doc.put(["scenes", si, "elements", byName(v.scenes[si].elements, "id", el)], record);
  },
  insertPoint(p, scene, el, curve, point) {
    const v = p.json();
    const si = sceneIdx(v, scene);
    const ei = byName(v.scenes[si].elements, "id", el);
    const pts: Obj[] = v.scenes[si].elements[ei].curves[curve];
    const at = pts.findIndex((q) => q.t > point.t);
    p.doc.insert(["scenes", si, "elements", ei, "curves", curve], at === -1 ? pts.length : at, point);
  },
};

/** The effects and derived events of `scene` that depend on a removed thing, to a fixed point (a removed event removes its users). */
const cascade = (
  scene: Obj,
  uses: (expr: any) => boolean,
  targets: (effect: Obj) => boolean,
  effectKey: string,
  eventKey: string
): { effects: number[]; events: number[] } => {
  const effects = new Set<number>();
  const events = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    const goneEvents = [...events].map((i) => scene.events[i][eventKey]);
    const goneEffects = [...effects].map((i) => scene.effects[i][effectKey]);
    const uses2 = (x: any): boolean =>
      uses(x) || goneEvents.some((n) => mentions(x, "event", n)) || goneEffects.some((n) => mentions(x, "effect", n));
    scene.effects.forEach((e: Obj, i: number) => {
      if (!effects.has(i) && (targets(e) || exprsOf(e).some(uses2))) (effects.add(i), (changed = true));
    });
    scene.events.forEach((e: Obj, i: number) => {
      if (!events.has(i) && exprsOf(e).some(uses2)) (events.add(i), (changed = true));
    });
  }
  return { effects: [...effects].sort((a, b) => a - b), events: [...events].sort((a, b) => a - b) };
};

// ================================================================================================= keyed

const posOf = (xs: [string, Obj][], index: number): number => {
  const sorted = xs.toSorted((a, b) => a[1].pos - b[1].pos || (a[0] < b[0] ? -1 : 1));
  const prev = sorted[index - 1]?.[1].pos;
  const next = sorted[index]?.[1].pos;
  return prev === undefined ? (next === undefined ? 1 : next - 1) : next === undefined ? prev + 1 : (prev + next) / 2;
};
const ordered = (m: Obj): [string, Obj][] =>
  Object.entries(m as Record<string, Obj>).sort((a, b) => a[1].pos - b[1].pos || (a[0] < b[0] ? -1 : 1));

const keyedSeed = (ir: any): Json => {
  const identities: Obj = {};
  const elUid = (name: string): string => {
    identities[`E:${name}`] ??= { name };
    return `E:${name}`;
  };
  const chapters: Obj = {};
  ir.chapters.forEach((c: Obj, i: number) => {
    const { sceneIds: _s, ...rest } = c;
    chapters[`C:${c.id}`] = { ...rest, pos: i + 1 };
  });
  const scenes: Obj = {};
  ir.scenes.forEach((s: Obj, si: number) => {
    const fx: Obj = Object.fromEntries(s.effects.map((e: Obj) => [e.id, `F:${s.id}:${e.id}`]));
    const ev: Obj = Object.fromEntries(s.events.map((e: Obj) => [e.name, `V:${s.id}:${e.name}`]));
    const map = (x: any): any =>
      mapRefs(x, (k, v) => (k === "element" ? elUid(v) : k === "effect" ? (fx[v] ?? v) : (ev[v] ?? v)));
    const elements: Obj = {};
    s.elements.forEach((e: Obj, i: number) => {
      const { id, curves, ...rest } = e;
      elements[elUid(id)] = { ...rest, pos: i + 1 };
      if (curves) {
        elements[elUid(id)].curves = Object.fromEntries(
          Object.entries(curves as Obj).map(([cn, pts]) => [
            cn,
            Object.fromEntries((pts as Obj[]).map((pt, pi) => [`P:${s.id}:${id}:${cn}:${pi}`, pt])),
          ])
        );
      }
    });
    scenes[`S:${s.id}`] = {
      id: s.id,
      chapterUid: `C:${s.chapterId}`,
      heading: s.heading,
      line: s.line,
      transition: s.transition,
      pos: si + 1,
      elements,
      effects: Object.fromEntries(
        s.effects.map((e: Obj, i: number) => {
          const { target, when, until, ...rest } = e;
          const out: Obj = { ...rest, pos: i + 1, when: map(when) };
          if (target !== undefined) out.target = elUid(target);
          if (until !== undefined) out.until = { ...until, event: map(until.event) };
          return [fx[e.id], out];
        })
      ),
      events: Object.fromEntries(s.events.map((e: Obj, i: number) => [ev[e.name], { ...e, event: map(e.event), pos: i + 1 }])),
      // `lines[].id` is `<scene>.l<n>`: derived from the scene id and the position, so it is not stored.
      lines: Object.fromEntries(
        s.lines.map((l: Obj, i: number) => {
          const { id: _id, ...rest } = l;
          return [`L:${s.id}:${i}`, { ...rest, pos: i + 1 }];
        })
      ),
    };
  });
  const { chapters: _c, scenes: _s, ...top } = ir;
  return { ...top, identities, chapters, scenes } as Json;
};

/**
 * `uniqueNames` makes the projection total over name clashes: identities that share a name get a deterministic suffix
 * (by uid order), the same one in every scene, so identity across scenes survives.
 */
export const keyedView = (doc: any, uniqueNames = false): any => {
  const unique = new Map<string, string>();
  if (uniqueNames) {
    const taken = new Set<string>();
    for (const uid of Object.keys(doc.identities).sort()) {
      let n = doc.identities[uid].name as string;
      let i = 1;
      while (taken.has(n)) n = `${doc.identities[uid].name}~${(i += 1)}`;
      taken.add(n);
      unique.set(uid, n);
    }
  }
  const name = (uid: string): string => unique.get(uid) ?? doc.identities[uid]?.name ?? `?${uid}`;
  const chapters = ordered(doc.chapters);
  const sceneList = ordered(doc.scenes);
  const { identities: _i, chapters: _c, scenes: _s, ...top } = doc;
  return {
    ...top,
    chapters: chapters.map(([cuid, c]) => {
      const { pos: _p, ...rest } = c;
      const ids = sceneList.filter(([, s]) => s.chapterUid === cuid).map(([, s]) => s.id);
      return { ...rest, sceneIds: ids };
    }),
    scenes: sceneList.map(([, s]) => {
      const fxName = (uid: string): string => s.effects[uid]?.id ?? `?${uid}`;
      const evName = (uid: string): string => s.events[uid]?.name ?? `?${uid}`;
      const back = (x: any): any => mapRefs(x, (k, v) => (k === "element" ? name(v) : k === "effect" ? fxName(v) : evName(v)));
      return {
        chapterId: doc.chapters[s.chapterUid]?.id ?? `?${s.chapterUid}`,
        effects: ordered(s.effects).map(([, e]) => {
          const { pos: _p, target, when, until, ...rest } = e;
          const out: Obj = { ...rest, when: back(when) };
          if (target !== undefined) out.target = name(target);
          if (until !== undefined) out.until = { ...until, event: back(until.event) };
          return out;
        }),
        elements: ordered(s.elements).map(([uid, e]) => {
          const { pos: _p, curves, ...rest } = e;
          const out: Obj = { ...rest, id: name(uid) };
          if (curves)
            out.curves = Object.fromEntries(
              Object.entries(curves as Obj).map(([cn, pts]) => [
                cn,
                Object.entries(pts as Record<string, Obj>)
                  .sort((a, b) => a[1].t - b[1].t || (a[0] < b[0] ? -1 : 1))
                  .map(([, pt]) => pt),
              ])
            );
          return out;
        }),
        events: ordered(s.events).map(([, e]) => {
          const { pos: _p, ...rest } = e;
          return { ...rest, event: back(e.event) };
        }),
        heading: s.heading,
        id: s.id,
        line: s.line,
        lines: ordered(s.lines).map(([, l], i) => {
          const { pos: _p, ...rest } = l;
          return { ...rest, id: `${s.id}.l${i + 1}` };
        }),
        transition: s.transition,
      };
    }),
  };
};

/** The uid of the element identity named `name` in the replica's registry. */
const uidOfElement = (doc: any, name: string): string => {
  const found = Object.entries(doc.identities as Record<string, Obj>).find(([, v]) => v.name === name);
  if (found === undefined) throw new Error(`no identity ${name}`);
  return found[0];
};
const sceneUid = (doc: any, id: string): string => {
  const found = Object.entries(doc.scenes as Record<string, Obj>).find(([, v]) => v.id === id);
  if (found === undefined) throw new Error(`no scene ${id}`);
  return found[0];
};
const nameKeyed = (doc: any, kind: "effects" | "events", suid: string, name: string): string => {
  const key = kind === "effects" ? "id" : "name";
  const found = Object.entries(doc.scenes[suid][kind] as Record<string, Obj>).find(([, v]) => v[key] === name);
  if (found === undefined) throw new Error(`no ${kind} ${name}`);
  return found[0];
};
/** Writes a name-based IR event expression with uids, as the keyed document stores it. */
const toUids = (doc: any, suid: string, expr: any): any =>
  mapRefs(expr, (k, v) => (k === "element" ? uidOfElement(doc, v) : k === "effect" ? nameKeyed(doc, "effects", suid, v) : nameKeyed(doc, "events", suid, v)));

export const keyed: Model = {
  name: "keyed",
  seed: (ir) => keyedSeed(ir),
  view: keyedView,
  open: (lib, actor, ir) => new Peer(makeDoc(lib, actor, keyedSeed(ir)), actor),
  setElementProp(p, scene, el, prop, value) {
    const d = p.json();
    p.doc.put(["scenes", sceneUid(d, scene), "elements", uidOfElement(d, el), ...prop.split(".")], value);
  },
  deleteElement(p, scene, el) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    const euid = uidOfElement(d, el);
    const s = d.scenes[suid];
    const asList = {
      effects: Object.entries(s.effects as Record<string, Obj>).map(([uid, e]) => ({ ...e, uid })),
      events: Object.entries(s.events as Record<string, Obj>).map(([uid, e]) => ({ ...e, uid })),
    };
    const dead = cascade(asList, (x) => mentions(x, "element", euid), (item) => item.target === euid, "uid", "uid");
    for (const i of dead.effects) p.doc.remove(["scenes", suid, "effects", asList.effects[i]!.uid]);
    for (const i of dead.events) p.doc.remove(["scenes", suid, "events", asList.events[i]!.uid]);
    p.doc.remove(["scenes", suid, "elements", euid]);
  },
  addEffect(p, scene, index, effect) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    const { target, when, until, ...rest } = effect;
    const out: Obj = { ...rest, when: toUids(d, suid, when), pos: posOf(Object.entries(d.scenes[suid].effects), index) };
    if (target !== undefined) out.target = uidOfElement(d, target);
    if (until !== undefined) out.until = { ...until, event: toUids(d, suid, until.event) };
    p.doc.put(["scenes", suid, "effects", p.uid("F")], out);
  },
  addEvent(p, scene, event) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    const n = Object.keys(d.scenes[suid].events).length;
    p.doc.put(["scenes", suid, "events", p.uid("V")], { ...event, event: toUids(d, suid, event.event), pos: posOf(Object.entries(d.scenes[suid].events), n) });
  },
  setEventExpr(p, scene, name, expr) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    p.doc.put(["scenes", suid, "events", nameKeyed(d, "events", suid, name), "event"], toUids(d, suid, expr));
  },
  renameElement(p, from, to) {
    const d = p.json();
    p.doc.put(["identities", uidOfElement(d, from), "name"], to);
  },
  setPointField(p, scene, el, curve, index, field, value) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    const euid = uidOfElement(d, el);
    const pts = Object.entries(d.scenes[suid].elements[euid].curves[curve] as Record<string, Obj>).sort((a, b) => a[1].t - b[1].t || (a[0] < b[0] ? -1 : 1));
    p.doc.put(["scenes", suid, "elements", euid, "curves", curve, pts[index]![0], field], value);
  },
  moveScene(p, id, to) {
    const d = p.json();
    const sorted = Object.entries(d.scenes as Record<string, Obj>).filter(([, s]) => s.id !== id);
    sorted.sort((a, b) => a[1].pos - b[1].pos || (a[0] < b[0] ? -1 : 1));
    p.doc.put(["scenes", sceneUid(d, id), "pos"], posOf(sorted, to));
  },
  replaceElement(p, scene, el, record) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    const euid = uidOfElement(d, el);
    p.doc.put(["scenes", suid, "elements", euid], { ...record, pos: d.scenes[suid].elements[euid].pos });
  },
  insertPoint(p, scene, el, curve, point) {
    const d = p.json();
    const suid = sceneUid(d, scene);
    p.doc.put(["scenes", suid, "elements", uidOfElement(d, el), "curves", curve, p.uid("P")], point);
  },
};

export const models: readonly Model[] = [naive, keyed];
export { atomic };
