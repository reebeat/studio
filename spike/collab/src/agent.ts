// Agents as peers: can an agent apply JSON Patch operations (effect 4.1 `JsonPatch`) to the CRDT document as a peer,
// with attribution?
//   T1  the agent diffs the *keyed document* (maps keyed by uid) with `JsonPatch.get`, applies the patch on its own
//       replica (peer id 777, a name registered), syncs with a human who edited concurrently; then: valid IR? who wrote what?
//   T2  the same with the IR-level (arrays) document: `JsonPatch.get` diffs arrays by position. What patch does an insert make,
//       and what happens when the patch is applied by index on a document that has moved on?
//   T3  edit at an older version on the live document (Yjs, Automerge, Loro), the alternative to a replica per agent.
import * as A from "@automerge/automerge";
import { JsonPatch, JsonPointer } from "effect";
import { LoroDoc, LoroMap } from "loro-crdt";
import * as Y from "yjs";
import { libs, wrapY, yjsOptions, type Doc, type Json, type Lib } from "./doc.ts";
import { canon } from "./canon.ts";
import { baseIr, validate } from "./ir.ts";
import { keyed, naive, type Peer } from "./model.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const AGENT = 777;
const HUMAN = 2;
const names: Record<number, string> = { [AGENT]: "agent:claude-1", [HUMAN]: "human:ana", 1: "origin" };

const tokens = (pointer: string): string[] => (pointer === "" ? [] : pointer.split("/").slice(1).map(JsonPointer.unescapeToken));

/** Applies add / remove / replace operations (all that effect 4.1 `JsonPatch` has) to a CRDT document. */
export const applyPatch = (doc: Doc, patch: JsonPatch.JsonPatch): void => {
  for (const op of patch) {
    const path = tokens(op.path);
    const parentPath = path.slice(0, -1);
    const last = path.at(-1) as string;
    const parent = doc.get(parentPath);
    if (Array.isArray(parent)) {
      const index = last === "-" ? parent.length : Number(last);
      if (op.op === "add") doc.insert(parentPath, index, op.value as Json);
      else if (op.op === "remove") doc.remove([...parentPath, index]);
      else doc.put([...parentPath, index], op.value as Json);
    } else if (op.op === "remove") doc.remove(path);
    else doc.put(path, op.value as Json);
  }
};

// ------------------------------------------------------------------------------------------------ attribution

/** Who wrote the value at `path` last, by the library's own metadata (null: the library cannot say). */
export const lastWriter = (doc: Doc, path: (string | number)[]): number | null => {
  const raw = (doc as any).doc;
  const parentPath = path.slice(0, -1);
  const key = path.at(-1) as string;
  if (doc.lib === "yjs") {
    let cur: any = (raw as Y.Doc).getMap("ir");
    for (const k of parentPath) cur = cur instanceof Y.Map ? cur.get(k as string) : cur.get(k as number);
    return (cur as any)._map.get(key)?.id.client ?? null;
  }
  if (doc.lib === "loro") {
    let cur: any = (raw as LoroDoc).getMap("ir");
    for (const k of parentPath) cur = cur.get(k);
    return Number((cur as LoroMap).getLastEditor(key));
  }
  // Automerge: the operation that set the key; ids of operations are `counter@actor`, the larger counter is the later one.
  const am = raw as A.Doc<any>;
  let obj: any = am;
  for (const k of parentPath) obj = obj[k];
  const id = A.getObjectId(obj);
  let best: { counter: number; actor: string } | undefined;
  for (const bin of A.getAllChanges(am)) {
    const change = A.decodeChange(bin) as any;
    change.ops.forEach((op: any, i: number) => {
      if (op.obj === id && op.key === key && !op.insert) {
        const counter = change.startOp + i;
        if (best === undefined || counter > best.counter || (counter === best.counter && change.actor > best.actor)) best = { counter, actor: change.actor };
      }
    });
  }
  return best === undefined ? null : parseInt(best.actor, 16);
};

const who = (n: number | null): string => (n === null ? "unknown" : (names[n] ?? `peer ${n}`));

/** Change-level metadata (message, time) the library keeps, where it keeps any. */
const changeLog = (doc: Doc): string => {
  const raw = (doc as any).doc;
  if (doc.lib === "automerge")
    return JSON.stringify(A.getAllChanges(raw).map((c) => A.decodeChange(c)).map((c: any) => `${parseInt(c.actor, 16)}:${c.message ?? "-"}`));
  if (doc.lib === "loro") {
    const all = (raw as LoroDoc).getAllChanges();
    return JSON.stringify([...all.entries()].map(([peer, cs]) => `${peer}:${cs.map((c: any) => c.message ?? "-").join("|")}`));
  }
  return "none: Yjs updates carry no message; the client id is the only author mark (Y.PermanentUserData maps it to a user)";
};

// ----------------------------------------------------------------------------------------------------- T1

const t1 = (lib: Lib): string[] => {
  const out: string[] = [];
  const origin = keyed.open(lib, 1, baseIr());
  const human: Peer = origin.fork(HUMAN);
  const agent: Peer = origin.fork(AGENT);
  if (lib === "yjs") {
    const pud = new Y.PermanentUserData((agent.doc as any).doc);
    pud.setUserMapping((agent.doc as any).doc, AGENT, names[AGENT]!);
  }
  // the agent reads its replica, edits a copy, and diffs the two documents with effect's JsonPatch
  const before = agent.json();
  const after = clone(before);
  after.scenes["S:sc4"].elements["E:hint"].class = "accent";
  after.scenes["S:sc4"].elements["E:one"].cell = "tl";
  after.scenes["S:sc4"].elements["E:one"].curves.opacity["P:sc4:one:opacity:1"].v = 0.9;
  after.scenes["S:sc4"].effects["agent~777.1"] = {
    id: "ag1", line: 99, verb: "sound", name: "pop", pos: 0.5, when: { absoluteFlicks: 705600000, reason: "agent" }, written: "1s because agent",
  };
  const patch = JsonPatch.get(before, after);
  out.push(`patch: ${patch.length} ops: ${patch.map((o) => `${o.op} ${o.path.replace("/scenes/S:sc4/", "")}`).join(" | ")}`);
  agent.doc.commit({ message: "agent:claude-1 run 7" });
  applyPatch(agent.doc, patch);
  agent.doc.commit({ message: "agent:claude-1 run 7" });
  // meanwhile a human edits other things, and the same cell
  keyed.renameElement(human, "tag", "label2");
  keyed.setElementProp(human, "sc4", "one", "cell", "br");
  keyed.addEffect(human, "sc4", 0, { id: "h1", line: 99, verb: "sound", name: "pop", when: { absoluteFlicks: 1, reason: "human" }, written: "x" });
  human.doc.commit({ message: "ana" });
  human.doc.merge(agent.doc);
  agent.doc.merge(human.doc);
  const merged = human.doc;
  const view = keyed.view(merged.json());
  const verdict = validate(view);
  out.push(`merged: converged=${canon(keyed.view(agent.json())) === canon(view)} valid=${verdict.ok}${verdict.ok ? "" : ` (${verdict.errors[0]})`}`);
  if (lib === "yjs") {
    const pud = new Y.PermanentUserData((merged as any).doc);
    out.push(`  Y.PermanentUserData on the merged doc: client ${AGENT} is "${(pud as any).getUserByClientId(AGENT)}"`);
  }
  const sc = view.scenes.find((s: any) => s.id === "sc4");
  out.push(`  agent edits kept: hint.class=${sc.elements.find((e: any) => e.id === "hint").class}, opacity=${JSON.stringify(sc.elements.find((e: any) => e.id === "one").curves.opacity[1])}, ag1 present=${sc.effects.some((e: any) => e.id === "ag1")}; human edits kept: tag renamed=${sc.elements.some((e: any) => e.id === "label2")}, h1 present=${sc.effects.some((e: any) => e.id === "h1")}; conflict one.cell=${sc.elements.find((e: any) => e.id === "one").cell}`);
  const writers: [string, (string | number)[]][] = [
    ["hint.class (agent only)", ["scenes", "S:sc4", "elements", "E:hint", "class"]],
    ["one.cell (both wrote)", ["scenes", "S:sc4", "elements", "E:one", "cell"]],
    ["identity name of tag (human only)", ["identities", "E:tag", "name"]],
    ["effect ag1 (agent created)", ["scenes", "S:sc4", "effects", "agent~777.1"]],
  ];
  for (const [label, path] of writers) out.push(`  last writer of ${label}: ${who(lastWriter(merged, path))}`);
  out.push(`  change log: ${changeLog(merged)}`);
  return out;
};

// ----------------------------------------------------------------------------------------------------- T2

const t2 = (lib: Lib): string[] => {
  const out: string[] = [];
  if (lib === "yjs") yjsOptions.gc = true;
  const origin = naive.open(lib, 1, baseIr());
  const base = origin.json();
  const sc4 = (ir: any): any => ir.scenes[3];
  // E1: one field of one effect; E2: one new effect inserted at index 1
  const e1 = clone(base);
  sc4(e1).effects[1].name = "pop"; // s2: ding -> pop
  const e2 = clone(base);
  sc4(e2).effects.splice(1, 0, { id: "ag1", line: 99, verb: "sound", name: "pop", when: { absoluteFlicks: 705600000, reason: "agent" }, written: "x" });
  const p1 = JsonPatch.get(base, e1);
  const p2 = JsonPatch.get(base, e2);
  out.push(`E1 (rename sound of s2): ${p1.length} op: ${p1.map((o) => `${o.op} ${o.path.replace("/scenes/3/", "")}`).join(", ")}`);
  out.push(`E2 (insert effect ag1 at 1 of ${sc4(base).effects.length}): ${p2.length} ops: ${p2.map((o) => `${o.op} ${o.path.replace("/scenes/3/effects/", "")}`).join(", ")} (everything after the insertion point is rewritten field by field)`);
  const human = origin.fork(HUMAN);
  naive.addEffect(human, "sc4", 0, { id: "h1", line: 99, verb: "sound", name: "pop", when: { absoluteFlicks: 1, reason: "human" }, written: "x" });
  const effects = (p: Peer): string => sc4(p.json()).effects.map((e: any) => `${e.id}${e.name ? `:${e.name}` : ""}`).join(",");
  // V1: the patch is applied by index to the live document, which has moved on
  const live = human.fork(3);
  applyPatch(live.doc, p1);
  out.push(`V1 E1 applied by index to the live doc (a human inserted h1 at 0 meanwhile): effects=[${effects(live)}]  <- s1 got "pop", s2 unchanged; valid=${validate(naive.view(live.json())).ok}`);
  const live2 = human.fork(4);
  applyPatch(live2.doc, p2);
  const ids2 = sc4(live2.json()).effects.map((e: any) => e.id).join(",");
  out.push(`V1 E2 applied by index to the live doc: effect ids=[${ids2}] valid=${validate(naive.view(live2.json())).ok}`);
  // V2: the agent is a peer with its own replica, made when it read the document
  for (const [label, patch] of [["E1", p1], ["E2", p2]] as const) {
    const agent = origin.fork(AGENT);
    applyPatch(agent.doc, patch);
    agent.doc.commit({ message: "agent run 7" });
    const h2 = human.fork(5);
    h2.doc.merge(agent.doc);
    const v = validate(naive.view(h2.json()));
    out.push(`V2 ${label} applied on the agent's own replica, then merged: effects=[${effects(h2)}] valid=${v.ok}${v.ok ? "" : ` (${v.errors[0]})`}`);
  }
  return out;
};

// ----------------------------------------------------------------------------------------------------- T3

const t3 = (): string[] => {
  const out: string[] = [];
  const seedList = ["a", "b", "c"].map((id) => ({ id }));
  // Yjs: needs gc off, a snapshot, and a document rebuilt from it
  const y1 = new Y.Doc({ gc: false });
  y1.clientID = 1;
  y1.getArray("l").push(seedList.map((x) => new Y.Map(Object.entries(x))));
  const snap = Y.snapshot(y1);
  y1.getArray<Y.Map<string>>("l").insert(0, [new Y.Map([["id", "human"]])]);
  const ya = Y.createDocFromSnapshot(y1, snap);
  ya.clientID = AGENT;
  wrapY(ya).put(["x"], "marker");
  (ya.getArray("l").get(2) as Y.Map<string>).set("id", "c-edited");
  Y.applyUpdate(y1, Y.encodeStateAsUpdate(ya, Y.encodeStateVector(y1)));
  out.push(`yjs      (gc must be false; snapshot + createDocFromSnapshot): ${JSON.stringify(y1.getArray("l").toJSON())}`);
  // Loro: forkAt(frontiers)
  const l = new LoroDoc();
  l.setPeerId(1);
  const ll = l.getList("l");
  for (const [i, x] of seedList.entries()) ll.insertContainer(i, new LoroMap()).set("id", x.id);
  l.commit();
  const frontiers = l.frontiers();
  l.getList("l").insertContainer(0, new LoroMap()).set("id", "human");
  l.commit();
  const la = l.forkAt(frontiers);
  la.setPeerId(AGENT);
  (la.getList("l").get(2) as LoroMap).set("id", "c-edited");
  la.commit({ message: "agent" });
  l.import(la.export({ mode: "update" }));
  out.push(`loro     (forkAt(frontiers)): ${JSON.stringify((l.toJSON() as any).l)}`);
  // Automerge: view(heads) + clone, or changeAt
  let h: any = A.from({ l: seedList }, { actor: "01".padEnd(32, "0") as any });
  const heads = A.getHeads(h);
  h = A.change(h, (x: any) => x.l.insertAt(0, { id: "human" }));
  const agent = A.clone(A.view(h, heads) as any, { actor: AGENT.toString(16).padStart(32, "0") as any });
  const agent2 = A.change(agent, (x: any) => (x.l[2].id = "c-edited"));
  h = A.merge(h, agent2);
  out.push(`automerge (A.view(heads) + clone): ${JSON.stringify(h.l)}`);
  let h2: any = A.from({ l: seedList }, { actor: "01".padEnd(32, "0") as any });
  const heads2 = A.getHeads(h2);
  h2 = A.change(h2, (x: any) => x.l.insertAt(0, { id: "human" }));
  const r = A.changeAt(h2, heads2, { message: "agent" }, (x: any) => (x.l[2].id = "c-edited"));
  out.push(`automerge (A.changeAt(heads)): ${JSON.stringify((r.newDoc as any).l)}`);
  return out;
};

if (import.meta.main) {
  for (const lib of libs) {
    console.log(`\n=== ${lib} ===`);
    console.log("-- T1 keyed document, JsonPatch.get on the document, agent is a peer");
    for (const l of t1(lib)) console.log(l);
    console.log("-- T2 IR-level (naive) document");
    for (const l of t2(lib)) console.log(l);
  }
  console.log("\n=== T3 edit at an older version on a live document ===");
  for (const l of t3()) console.log(l);
}
