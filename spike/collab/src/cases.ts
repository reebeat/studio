// The five concurrent-edit cases of the spike (a to e, with variants), run on every library and both models.
// Each case forks two replicas of the same base story, lets each make one edit unseen by the other, syncs both
// ways, then reports: did the replicas converge, the merged value of what the case is about, and is the merged
// view a valid IR (real `GraphSchema` + `validateScene` of spec 0004, plus the stand-in checks of `ir.ts`).
import { atomic, libs, sync, type Doc, type Json, type Lib } from "./doc.ts";
import { canon } from "./canon.ts";
import { baseIr, validate } from "./ir.ts";
import { models, type Model, type Peer } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Edit = (m: Model, p: Peer) => void;
interface Case {
  readonly id: string;
  readonly title: string;
  readonly a: Edit;
  readonly b: Edit;
  /** What the merged IR shows for this case, as a short string. */
  readonly show: (ir: any) => string;
}

const scene = (ir: any, id: string): any => ir.scenes.find((s: any) => s.id === id);
const el = (ir: any, sc: string, id: string): any => scene(ir, sc)?.elements.find((e: any) => e.id === id);
// JSON has no undefined: an effect with no `name` omits the key (Automerge throws on undefined, as it should).
const absolute = (id: string, extra: object = {}): any =>
  JSON.parse(
    JSON.stringify({
      id,
      line: 99,
      verb: "sound",
      name: "pop",
      when: { absoluteFlicks: 705600000, reason: "spike" },
      written: "1s because spike",
      ...extra,
    })
  );
const shiftRef = (name: string): any => ({
  kind: "shift",
  of: { kind: "ref", name },
  offset: { unit: "flicks", value: 70560000 },
});

export const cases: readonly Case[] = [
  {
    id: "a1",
    title: "move the same element to different cells (cell, an enum)",
    a: (m, p) => m.setElementProp(p, "sc4", "one", "cell", "tl"),
    b: (m, p) => m.setElementProp(p, "sc4", "one", "cell", "br"),
    show: (ir) => `cell=${el(ir, "sc4", "one").cell}`,
  },
  {
    id: "a2",
    title: "move one element along x (user A) and along y (user B): property-wise merge",
    a: (m, p) => m.setElementProp(p, "sc4", "one", "at.x", 0.1),
    b: (m, p) => m.setElementProp(p, "sc4", "one", "at.y", 0.9),
    show: (ir) => {
      const { x, y } = el(ir, "sc4", "one").at;
      return `at=(${x}, ${y})${x !== 0.5 && y !== 0.5 ? " MIXED (a position neither user chose)" : ""}`;
    },
  },
  {
    id: "a4",
    title: "reorder: both move scene `sc7` (a title card) to different places: before sc5, and before sc6",
    a: (m, p) => m.moveScene(p, "sc7", 4),
    b: (m, p) => m.moveScene(p, "sc7", 5),
    show: (ir) => `scenes=[${ir.scenes.map((s: any) => s.id).join(",")}]`,
  },
  {
    id: "a3",
    title: "move the same element to different (x, y), edited as one atomic value",
    a: (m, p) => m.setElementProp(p, "sc4", "one", "at", atomic({ x: 0.1, y: 0.1 })),
    b: (m, p) => m.setElementProp(p, "sc4", "one", "at", atomic({ x: 0.9, y: 0.9 })),
    show: (ir) => {
      const { x, y } = el(ir, "sc4", "one").at;
      return `at=(${x}, ${y})${x === y ? "" : " TORN"}`;
    },
  },
  {
    id: "b1",
    title: "one deletes element `tag` (with its dependants), the other edits its colour (class)",
    a: (m, p) => m.deleteElement(p, "sc4", "tag"),
    b: (m, p) => m.setElementProp(p, "sc4", "tag", "class", "muted"),
    show: (ir) => {
      const t = el(ir, "sc4", "tag");
      return t === undefined ? "tag deleted (colour edit lost)" : `tag kept, class=${t.class}`;
    },
  },
  {
    id: "b2",
    title: "one deletes element `tag` (with its dependants), the other adds an effect that targets it",
    a: (m, p) => m.deleteElement(p, "sc4", "tag"),
    b: (m, p) => m.addEffect(p, "sc4", 0, absolute("f9", { verb: "focus", name: undefined, target: "tag" })),
    show: (ir) => {
      const t = el(ir, "sc4", "tag");
      const f9 = scene(ir, "sc4").effects.find((e: any) => e.id === "f9");
      return `tag ${t === undefined ? "absent" : "present"}, f9 ${f9 === undefined ? "absent" : `targets ${f9.target}`}`;
    },
  },
  {
    id: "c1",
    title: "both insert an effect at index 1 (different ids)",
    a: (m, p) => m.addEffect(p, "sc4", 1, absolute("sA")),
    b: (m, p) => m.addEffect(p, "sc4", 1, absolute("sB")),
    show: (ir) => `effects=[${scene(ir, "sc4").effects.map((e: any) => e.id).join(",")}]`,
  },
  {
    id: "b3",
    title: "one deletes element `note` (with its dependants), the other replaces the whole `note` record",
    a: (m, p) => m.deleteElement(p, "sc4", "note"),
    b: (m, p) => m.replaceElement(p, "sc4", "note", { cell: "br", class: "label", text: "replaced", visible: false, line: 99, id: "note" }),
    show: (ir) => {
      const n = el(ir, "sc4", "note");
      return n === undefined ? "note deleted (replacement lost)" : `note kept, text=${n.text}`;
    },
  },
  {
    id: "c2",
    title: "both insert an effect at index 1, and both picked the next free id `s9`",
    a: (m, p) => m.addEffect(p, "sc4", 1, absolute("s9")),
    b: (m, p) => m.addEffect(p, "sc4", 1, absolute("s9", { name: "ding" })),
    show: (ir) => `effects=[${scene(ir, "sc4").effects.map((e: any) => e.id).join(",")}]`,
  },
  {
    id: "c4",
    title: "both insert a run of three effects at index 1 (does the merge keep each run together?)",
    a: (m, p) => ["a1", "a2", "a3"].forEach((id, i) => m.addEffect(p, "sc4", 1 + i, absolute(id))),
    b: (m, p) => ["b1", "b2", "b3"].forEach((id, i) => m.addEffect(p, "sc4", 1 + i, absolute(id))),
    show: (ir) => `effects=[${scene(ir, "sc4").effects.map((e: any) => e.id).slice(0, 8).join(",")}]`,
  },
  {
    id: "c3",
    title: "derived events p and q: one anchors p to q, the other anchors q to p (a cycle)",
    a: (m, p) => m.setEventExpr(p, "sc4", "p", shiftRef("q")),
    b: (m, p) => m.setEventExpr(p, "sc4", "q", shiftRef("p")),
    show: (ir) => {
      const ev = (n: string): any => scene(ir, "sc4").events.find((e: any) => e.name === n)?.event;
      return `p=${ev("p")?.of?.name ?? ev("p")?.kind}, q=${ev("q")?.of?.name ?? ev("q")?.kind}`;
    },
  },
  {
    id: "d1",
    title: "one renames element `one` to `cube` everywhere, the other adds an effect that targets `one`",
    a: (m, p) => m.renameElement(p, "one", "cube"),
    b: (m, p) => m.addEffect(p, "sc4", 0, absolute("f9", { verb: "focus", name: undefined, target: "one" })),
    show: (ir) => {
      const f9 = scene(ir, "sc4").effects.find((e: any) => e.id === "f9");
      return `f9 targets ${f9?.target}; sc4 elements=[${scene(ir, "sc4").elements.map((e: any) => e.id)}]`;
    },
  },
  {
    id: "d2",
    title: "one renames `one` to `cube`, the other adds an event anchored to `one.move.end` in sc5",
    a: (m, p) => m.renameElement(p, "one", "cube"),
    b: (m, p) =>
      m.addEvent(p, "sc5", {
        event: { anchor: { at: "end", kind: "edge", subject: { id: "one", kind: "element" }, transition: "move" }, kind: "anchor" },
        line: 99,
        name: "z",
        written: "one.move.end",
      }),
    show: (ir) => {
      const z = scene(ir, "sc5").events.find((e: any) => e.name === "z");
      return `z anchors to ${z?.event?.anchor?.subject?.id}; sc5 elements=[${scene(ir, "sc5").elements.map((e: any) => e.id)}]`;
    },
  },
  {
    id: "d3",
    title: "one renames `one` to `cube` everywhere, the other adds a new element `one` to sc7",
    a: (m, p) => m.renameElement(p, "one", "cube"),
    b: (m, p) => addElement(m, p, "sc7", { id: "one", cell: "mc", class: "box", text: "again", visible: true, line: 99 }),
    show: (ir) => {
      const names = ir.scenes.flatMap((s: any) => s.elements.map((e: any) => `${s.id}:${e.id}`)).filter((x: string) => /one|cube/.test(x));
      return `identity ${names.join(" ")}`;
    },
  },
  {
    id: "d4",
    title: "one renames `one` to `box2`, the other renames `tag` to `box2` (same scene)",
    a: (m, p) => m.renameElement(p, "one", "box2"),
    b: (m, p) => m.renameElement(p, "tag", "box2"),
    show: (ir) => `sc4 elements=[${scene(ir, "sc4").elements.map((e: any) => e.id)}]`,
  },
  {
    id: "e1",
    title: "curve points: one moves p1 (t .3 to .6), the other moves p2 (t .7 to .4): they cross",
    a: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 1, "t", 0.6),
    b: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 2, "t", 0.4),
    show: (ir) => `t=[${el(ir, "sc4", "one").curves.opacity.map((q: any) => q.t)}]`,
  },
  {
    id: "e2",
    title: "curve points: one moves p1 (t .3 to .6), the other inserts a point at t=.5 after p1",
    a: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 1, "t", 0.6),
    b: (m, p) => m.insertPoint(p, "sc4", "one", "opacity", { t: 0.5, v: 0.6 }),
    show: (ir) => `t=[${el(ir, "sc4", "one").curves.opacity.map((q: any) => q.t)}]`,
  },
  {
    id: "e3",
    title: "curve points: one sets p1.v = .9, the other sets p1.t = .5 (same point, different fields)",
    a: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 1, "v", 0.9),
    b: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 1, "t", 0.5),
    show: (ir) => `points=${canon(el(ir, "sc4", "one").curves.opacity.slice(1, 2))}`,
  },
  {
    id: "e4",
    title: "curve points: both move a different point to t=.5 (a tie)",
    a: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 1, "t", 0.5),
    b: (m, p) => m.setPointField(p, "sc4", "one", "opacity", 2, "t", 0.5),
    show: (ir) => `t=[${el(ir, "sc4", "one").curves.opacity.map((q: any) => q.t)}]`,
  },
];

/** A new element instance in a scene (not in the Model interface because only d3 needs it). */
const addElement = (m: Model, p: Peer, sceneId: string, element: any): void => {
  if (m.name === "naive") {
    const v = p.json();
    const si = v.scenes.findIndex((s: any) => s.id === sceneId);
    p.doc.insert(["scenes", si, "elements"], v.scenes[si].elements.length, element);
    return;
  }
  const d = p.json();
  const suid = Object.entries(d.scenes as Record<string, any>).find(([, s]) => s.id === sceneId)![0];
  const { id, ...rest } = element;
  const existing = Object.entries(d.identities as Record<string, any>).find(([, v]) => v.name === id);
  // The peer has not seen the rename, so for it `one` is the identity E:one.
  const uid = existing?.[0] ?? p.uid("E");
  if (existing === undefined) p.doc.put(["identities", uid], { name: id });
  p.doc.put(["scenes", suid, "elements", uid], { ...rest, pos: Object.keys(d.scenes[suid].elements).length + 1 });
};

export interface Outcome {
  readonly case: string;
  readonly model: string;
  readonly lib: Lib;
  readonly converged: boolean;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly shown: string;
  /** The same case with the two users' actor ids swapped: does the merge depend on who the peer ids favour? */
  readonly swapped: { readonly valid: boolean; readonly shown: string; readonly same: boolean };
}

const once = (c: Case, m: Model, lib: Lib, swap: boolean, base: Json) => {
  const origin = m.open(lib, 1, base);
  const a = origin.fork(swap ? 3 : 2);
  const b = origin.fork(swap ? 2 : 3);
  c.a(m, a);
  a.doc.commit({ message: "A" });
  c.b(m, b);
  b.doc.commit({ message: "B" });
  sync(a.doc, b.doc);
  const va = m.view(a.json());
  const vb = m.view(b.json());
  const verdict = validate(va);
  return { view: va, converged: canon(va) === canon(vb), verdict, shown: c.show(va) };
};

export const runCase = (c: Case, m: Model, lib: Lib, base: Json = baseIr()): Outcome => {
  const r = once(c, m, lib, false, base);
  const s = once(c, m, lib, true, base);
  return {
    case: c.id,
    model: m.name,
    lib,
    converged: r.converged && s.converged,
    valid: r.verdict.ok,
    errors: r.verdict.errors,
    shown: r.shown,
    swapped: { valid: s.verdict.ok, shown: s.shown, same: canon(r.view) === canon(s.view) },
  };
};

export const runAll = (): Outcome[] => {
  const out: Outcome[] = [];
  for (const c of cases) for (const m of models) for (const lib of libs) out.push(runCase(c, m, lib));
  return out;
};

export type { Doc };

if (import.meta.main) {
  const outcomes = runAll();
  for (const c of cases) {
    console.log(`\n== ${c.id}: ${c.title}`);
    for (const o of outcomes.filter((x) => x.case === c.id))
      console.log(
        `  ${o.model.padEnd(5)} ${o.lib.padEnd(9)} ${o.converged ? "conv" : "DIVERGED"} ${o.valid ? "VALID  " : "INVALID"} ${o.swapped.same ? "" : "[SWAP-DIFFERS: " + o.swapped.shown + "] "}${o.shown}${o.valid ? "" : `   <- ${o.errors[0]?.slice(0, 110)}`}`
      );
  }
}
