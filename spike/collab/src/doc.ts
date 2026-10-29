// One path-addressed JSON document interface over the three CRDT libraries, so each concurrent-edit case is written
// once. A path is a list of keys: a string indexes a map, a number indexes a list. Plain JSON values become nested
// CRDT containers (maps and lists); `atomic` values are registers that merge whole (last writer wins).
import * as A from "@automerge/automerge";
import { LoroDoc, LoroMap, LoroMovableList } from "loro-crdt";
import * as Y from "yjs";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Key = string | number;
export type Path = readonly Key[];

/** A value stored as one register: concurrent writes to it never merge field by field. */
export class Atomic {
  constructor(readonly value: Json) {}
}
export const atomic = (value: Json): Atomic => new Atomic(value);

/** Yjs garbage-collects deleted content by default; editing at an older version needs it off. */
export const yjsOptions: { gc: boolean } = { gc: true };

export type Lib = "yjs" | "automerge" | "loro";

export interface Doc {
  readonly lib: Lib;
  /** A new replica with the same history and a new actor. */
  fork(actor: number): Doc;
  /** Imports everything `other` has that this replica lacks. */
  merge(other: Doc): void;
  json(): Json;
  get(path: Path): Json | undefined;
  /** Sets a map key (last key a string) or replaces a list item (last key a number). */
  put(path: Path, value: Json | Atomic): void;
  /** Inserts into the list at `path`. */
  insert(path: Path, index: number, value: Json | Atomic): void;
  /** Deletes a map key or a list item. */
  remove(path: Path): void;
  /** Moves list item `from` to index `to`. Yjs and Automerge have no move operation: it is a delete and an insert. */
  move(path: Path, from: number, to: number): void;
  /** Ends the current local change with attribution metadata. */
  commit(meta?: { readonly message?: string }): void;
  /** The full document, as the library saves it. */
  save(): Uint8Array;
  /** Changes since `since` (a state vector or heads token), as the library encodes updates. */
  updateSince(token: unknown): Uint8Array;
  /** An opaque token of what this replica has seen. */
  version(): unknown;
  applyUpdate(update: Uint8Array): void;
}

const isAtomic = (v: unknown): v is Atomic => v instanceof Atomic;
const parentAndKey = (path: Path): readonly [Path, Key] => {
  const key = path.at(-1);
  if (key === undefined) throw new Error("empty path");
  return [path.slice(0, -1), key];
};

// ---------------------------------------------------------------------------------------------------------- Yjs

const toY = (value: Json | Atomic): unknown => {
  if (isAtomic(value)) return value.value;
  if (Array.isArray(value)) return Y.Array.from(value.map(toY));
  if (value !== null && typeof value === "object")
    return new Y.Map(Object.entries(value).map(([k, v]) => [k, toY(v)]));
  return value;
};

class YDoc implements Doc {
  readonly lib = "yjs" as const;
  constructor(readonly doc: Y.Doc) {}
  static make(actor: number, from?: Json): YDoc {
    const doc = new Y.Doc({ gc: yjsOptions.gc });
    doc.clientID = actor;
    const d = new YDoc(doc);
    if (from !== undefined) {
      doc.transact(() => {
        const root = doc.getMap("ir");
        for (const [k, v] of Object.entries(from as Record<string, Json>)) root.set(k, toY(v) as never);
      });
    }
    return d;
  }
  fork(actor: number): Doc {
    const d = YDoc.make(actor);
    Y.applyUpdate(d.doc, Y.encodeStateAsUpdate(this.doc));
    return d;
  }
  merge(other: Doc): void {
    Y.applyUpdate(this.doc, Y.encodeStateAsUpdate((other as YDoc).doc, Y.encodeStateVector(this.doc)));
  }
  json(): Json {
    return this.doc.getMap("ir").toJSON() as Json;
  }
  private node(path: Path): unknown {
    let cur: unknown = this.doc.getMap("ir");
    for (const k of path) {
      if (cur instanceof Y.Map) cur = cur.get(k as string);
      else if (cur instanceof Y.Array) cur = cur.get(k as number);
      else if (cur !== null && typeof cur === "object") cur = (cur as Record<Key, unknown>)[k];
      else return undefined;
    }
    return cur;
  }
  get(path: Path): Json | undefined {
    const n = this.node(path);
    return n instanceof Y.Map || n instanceof Y.Array ? (n.toJSON() as Json) : (n as Json | undefined);
  }
  put(path: Path, value: Json | Atomic): void {
    const [pp, key] = parentAndKey(path);
    const p = this.node(pp);
    this.doc.transact(() => {
      if (p instanceof Y.Map) p.set(key as string, toY(value) as never);
      else if (p instanceof Y.Array) {
        p.delete(key as number, 1);
        p.insert(key as number, [toY(value)]);
      } else throw new Error(`no container at ${pp.join("/")}`);
    });
  }
  insert(path: Path, index: number, value: Json | Atomic): void {
    const p = this.node(path);
    if (!(p instanceof Y.Array)) throw new Error(`no list at ${path.join("/")}`);
    this.doc.transact(() => p.insert(index, [toY(value)]));
  }
  remove(path: Path): void {
    const [pp, key] = parentAndKey(path);
    const p = this.node(pp);
    this.doc.transact(() => {
      if (p instanceof Y.Map) p.delete(key as string);
      else if (p instanceof Y.Array) p.delete(key as number, 1);
      else throw new Error(`no container at ${pp.join("/")}`);
    });
  }
  move(path: Path, from: number, to: number): void {
    // No move operation: delete the item and insert a copy. Concurrent moves of one item leave two copies.
    const value = this.get([...path, from]) as Json;
    this.remove([...path, from]);
    this.insert(path, to, value);
  }
  commit(): void {}
  save(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }
  updateSince(token: unknown): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc, token as Uint8Array);
  }
  version(): unknown {
    return Y.encodeStateVector(this.doc);
  }
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.doc, update);
  }
}

// ----------------------------------------------------------------------------------------------------- Automerge

type AmRoot = Record<string, unknown>;

/**
 * Automerge 3 stores every JS string as a collaborative text object (one operation per character). An IR value like
 * `class: "muted"` or an id is a scalar, so by default it is written as an `ImmutableString` (one operation). Set
 * `amStrings.mode = "text"` to measure the default.
 */
export const amStrings: { mode: "scalar" | "text" } = { mode: process.env["AM_STRINGS"] === "text" ? "text" : "scalar" };
const amWrap = (v: unknown): unknown => {
  if (typeof v === "string") return amStrings.mode === "scalar" ? new A.ImmutableString(v) : v;
  if (Array.isArray(v)) return v.map(amWrap);
  if (v !== null && typeof v === "object" && !(v instanceof A.ImmutableString))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, amWrap(x)]));
  return v;
};

const amNode = (root: unknown, path: Path): unknown => {
  let cur = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<Key, unknown>)[k];
  }
  return cur;
};

class AmDoc implements Doc {
  readonly lib = "automerge" as const;
  pending: { message?: string } = {};
  constructor(
    public doc: A.Doc<AmRoot>,
    readonly actor: string
  ) {}
  static make(actor: number, from?: Json): AmDoc {
    const hex = actor.toString(16).padStart(32, "0");
    const doc = from === undefined ? A.init<AmRoot>({ actor: hex as A.ActorId }) : A.from(amWrap(from) as AmRoot, { actor: hex as A.ActorId });
    return new AmDoc(doc, hex);
  }
  fork(actor: number): Doc {
    const hex = actor.toString(16).padStart(32, "0");
    return new AmDoc(A.clone(this.doc, { actor: hex as A.ActorId }), hex);
  }
  merge(other: Doc): void {
    this.doc = A.merge(this.doc, (other as AmDoc).doc);
  }
  json(): Json {
    return JSON.parse(JSON.stringify(this.doc)) as Json;
  }
  get(path: Path): Json | undefined {
    const n = amNode(this.doc, path);
    return n === undefined ? undefined : (JSON.parse(JSON.stringify(n)) as Json);
  }
  private change(fn: (d: AmRoot) => void): void {
    const opts = this.pending.message === undefined ? {} : { message: this.pending.message };
    this.doc = A.change(this.doc, opts, fn);
  }
  put(path: Path, value: Json | Atomic): void {
    const [pp, key] = parentAndKey(path);
    const v = amWrap(isAtomic(value) ? value.value : value);
    this.change((d) => {
      (amNode(d, pp) as Record<Key, unknown>)[key] = v;
    });
  }
  insert(path: Path, index: number, value: Json | Atomic): void {
    const v = amWrap(isAtomic(value) ? value.value : value);
    this.change((d) => {
      (amNode(d, path) as { insertAt: (i: number, ...x: unknown[]) => void }).insertAt(index, v);
    });
  }
  remove(path: Path): void {
    const [pp, key] = parentAndKey(path);
    this.change((d) => {
      const p = amNode(d, pp);
      if (Array.isArray(p)) (p as unknown as { deleteAt: (i: number) => void }).deleteAt(key as number);
      else delete (p as Record<string, unknown>)[key as string];
    });
  }
  move(path: Path, from: number, to: number): void {
    // No move operation: delete the item and insert a copy. Concurrent moves of one item leave two copies.
    const value = this.get([...path, from]) as Json;
    this.remove([...path, from]);
    this.insert(path, to, value);
  }
  commit(meta?: { message?: string }): void {
    this.pending = meta ?? {};
  }
  save(): Uint8Array {
    return A.save(this.doc);
  }
  updateSince(token: unknown): Uint8Array {
    return A.saveSince(this.doc, token as A.Heads);
  }
  version(): unknown {
    return A.getHeads(this.doc);
  }
  applyUpdate(update: Uint8Array): void {
    this.doc = A.loadIncremental(this.doc, update);
  }
}

// -------------------------------------------------------------------------------------------------------- Loro

/** Replaces list item `index` in place (a `set`, so concurrent replacements are one register, not two items). */
const setLoroItem = (list: LoroMovableList, index: number, value: Json | Atomic): void => {
  const nested = !isAtomic(value) && value !== null && typeof value === "object";
  if (!nested) {
    list.set(index, (isAtomic(value) ? value.value : value) as never);
    return;
  }
  const child = Array.isArray(value) ? list.setContainer(index, new LoroMovableList()) : list.setContainer(index, new LoroMap());
  fillLoro(child, value);
};

const fillLoro = (child: LoroMap | LoroMovableList, value: Json): void => {
  if (Array.isArray(value)) value.forEach((v, i) => putLoro(child as LoroMovableList, i, v, "insert"));
  else for (const [k, v] of Object.entries(value as Record<string, Json>)) putLoro(child as LoroMap, k, v, "set");
};

const putLoro = (
  parent: LoroMap | LoroMovableList,
  key: Key | "append",
  value: Json | Atomic,
  mode: "set" | "insert"
): void => {
  const plain = isAtomic(value) ? value.value : value;
  const nested = !isAtomic(value) && value !== null && typeof value === "object";
  if (!nested) {
    if (mode === "set") (parent as LoroMap).set(key as string, plain as never);
    else (parent as LoroMovableList).insert(key as number, plain as never);
    return;
  }
  const fresh = Array.isArray(value) ? new LoroMovableList() : new LoroMap();
  const child =
    mode === "set"
      ? (parent as LoroMap).setContainer(key as string, fresh as never)
      : (parent as LoroMovableList).insertContainer(key as number, fresh as never);
  fillLoro(child as LoroMap | LoroMovableList, value);
};

class LoroDocAdapter implements Doc {
  readonly lib = "loro" as const;
  constructor(readonly doc: LoroDoc) {}
  static make(actor: number, from?: Json): LoroDocAdapter {
    const doc = new LoroDoc();
    doc.setPeerId(actor);
    const d = new LoroDocAdapter(doc);
    if (from !== undefined) {
      const root = doc.getMap("ir");
      for (const [k, v] of Object.entries(from as Record<string, Json>)) putLoro(root, k, v, "set");
      doc.commit();
    }
    return d;
  }
  fork(actor: number): Doc {
    const d = new LoroDocAdapter(new LoroDoc());
    d.doc.setPeerId(actor);
    d.doc.import(this.doc.export({ mode: "update" }));
    return d;
  }
  merge(other: Doc): void {
    this.doc.import((other as LoroDocAdapter).doc.export({ mode: "update", from: this.doc.version() }));
  }
  json(): Json {
    return (this.doc.toJSON() as { ir: Json }).ir;
  }
  private node(path: Path): unknown {
    let cur: unknown = this.doc.getMap("ir");
    for (const k of path) {
      if (cur instanceof LoroMap) cur = cur.get(k as string);
      else if (cur instanceof LoroMovableList) cur = cur.get(k as number);
      else if (cur !== null && typeof cur === "object") cur = (cur as Record<Key, unknown>)[k];
      else return undefined;
    }
    return cur;
  }
  get(path: Path): Json | undefined {
    const n = this.node(path);
    return n instanceof LoroMap || n instanceof LoroMovableList ? (n.toJSON() as Json) : (n as Json | undefined);
  }
  put(path: Path, value: Json | Atomic): void {
    const [pp, key] = parentAndKey(path);
    const p = this.node(pp);
    if (p instanceof LoroMap) putLoro(p, key, value, "set");
    else if (p instanceof LoroMovableList) setLoroItem(p, key as number, value);
    else throw new Error(`no container at ${pp.join("/")}`);
  }
  insert(path: Path, index: number, value: Json | Atomic): void {
    const p = this.node(path);
    if (!(p instanceof LoroMovableList)) throw new Error(`no list at ${path.join("/")}`);
    putLoro(p, index, value, "insert");
  }
  remove(path: Path): void {
    const [pp, key] = parentAndKey(path);
    const p = this.node(pp);
    if (p instanceof LoroMap) p.delete(key as string);
    else if (p instanceof LoroMovableList) p.delete(key as number, 1);
    else throw new Error(`no container at ${pp.join("/")}`);
  }
  move(path: Path, from: number, to: number): void {
    const p = this.node(path);
    if (!(p instanceof LoroMovableList)) throw new Error(`no list at ${path.join("/")}`);
    p.move(from, to);
  }
  commit(meta?: { message?: string }): void {
    this.doc.commit(meta?.message === undefined ? {} : { message: meta.message });
  }
  save(): Uint8Array {
    return this.doc.export({ mode: "snapshot" });
  }
  updateSince(token: unknown): Uint8Array {
    return this.doc.export({ mode: "update", from: token as never });
  }
  version(): unknown {
    return this.doc.version();
  }
  applyUpdate(update: Uint8Array): void {
    this.doc.import(update);
  }
}

export const makeDoc = (lib: Lib, actor: number, from?: Json): Doc =>
  lib === "yjs" ? YDoc.make(actor, from) : lib === "automerge" ? AmDoc.make(actor, from) : LoroDocAdapter.make(actor, from);

export const libs: readonly Lib[] = ["yjs", "automerge", "loro"];

/** Two-way sync of two replicas: each imports what the other has. */
export const sync = (a: Doc, b: Doc): void => {
  a.merge(b);
  b.merge(a);
};

export const wrapY = (d: Y.Doc): Doc => new YDoc(d);
export const wrapLoro = (d: LoroDoc): Doc => new LoroDocAdapter(d);
export const wrapAm = (d: A.Doc<AmRoot>, actor: string): Doc => new AmDoc(d, actor);
