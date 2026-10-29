// The story IR under test: the real `GraphSchema` and `validateScene` of reebeat spec 0004 (snapshot of commit
// a01bb39 in `ir/core-src`), the story `stories/same-id` imported through the real Fountain importer, plus a stand-in
// for what 0004 does not define yet (attributes as data curves, a position as a number pair, story-level references).
import { readFileSync } from "node:fs";
import { Result, Schema } from "effect";
import { GraphSchema, fountainImporter, jsonCodec } from "../ir/core-src/index.ts";
import { identityDiff } from "../ir/core-src/identity.ts";
import { validateScene } from "../ir/core-src/validate.ts";
import type { Json } from "./doc.ts";

const storyPath = new URL("../ir/same-id.fountain", import.meta.url).pathname;

/** A stand-in for the data curves of a later spec: a curve is control points over normalised time. */
export const CurveSchema = Schema.Array(
  Schema.Struct({ t: Schema.Number, v: Schema.Number })
).check(
  Schema.makeFilter((points) => {
    const errors: string[] = [];
    if (points.length < 2) errors.push("a curve needs two control points");
    if (points[0]?.t !== 0 || points.at(-1)?.t !== 1) errors.push("a curve starts at t=0 and ends at t=1");
    for (let i = 1; i < points.length; i += 1)
      if (!((points[i]?.t ?? 0) > (points[i - 1]?.t ?? 0))) errors.push(`t is not strictly increasing at point ${i}`);
    if (points.some((p) => p.v < 0 || p.v > 1)) errors.push("v is outside 0..1");
    return errors.length === 0 ? undefined : errors.join("; ");
  })
);
const AtSchema = Schema.Struct({ x: Schema.Number, y: Schema.Number });
const decodeCurve = Schema.decodeUnknownResult(CurveSchema);
const decodeAt = Schema.decodeUnknownResult(AtSchema);
const decodeGraph = Schema.decodeUnknownResult(GraphSchema);

export interface Verdict {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type Obj = Record<string, Json>;
const asObj = (v: Json | undefined): Obj => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : {});

/** The base IR: the real story, with the stand-in attributes on the element `one` of sc4. */
export const baseIr = (): Json => {
  const result = fountainImporter.import(readFileSync(storyPath, "utf8"));
  if (Result.isFailure(result)) throw new Error("same-id does not import");
  const graph = JSON.parse(JSON.stringify(result.success)) as Obj;
  const sc4 = (graph["scenes"] as Obj[]).find((s) => s["id"] === "sc4");
  const one = (sc4?.["elements"] as Obj[]).find((e) => e["id"] === "one");
  if (one === undefined) throw new Error("sc4 has no element one");
  one["at"] = { x: 0.5, y: 0.5 };
  one["curves"] = {
    opacity: [
      { t: 0, v: 0 },
      { t: 0.3, v: 0.5 },
      { t: 0.7, v: 0.8 },
      { t: 1, v: 1 },
    ],
  };
  // Two derived events with no dependency on each other, for the cycle case.
  sc4?.["events"] && (sc4["events"] as Obj[]).push(
    { event: { anchor: { at: "end", kind: "edge", subject: { id: "one", kind: "element" }, transition: "move" }, kind: "anchor" }, line: 90, name: "p", written: "one.move.end" },
    { event: { anchor: { at: "end", kind: "edge", subject: { id: "tag", kind: "element" }, transition: "update" }, kind: "anchor" }, line: 91, name: "q", written: "tag.update.end" }
  );
  return graph as Json;
};

/** Strips the stand-in attributes (the real schema is closed) and collects their verdicts. */
const split = (ir: Obj): { readonly stripped: Json; readonly errors: string[] } => {
  const errors: string[] = [];
  const copy = JSON.parse(JSON.stringify(ir)) as Obj;
  for (const scene of (Array.isArray(copy["scenes"]) ? copy["scenes"] : []) as Obj[])
    for (const el of (Array.isArray(scene["elements"]) ? scene["elements"] : []) as Obj[]) {
      const at = el["at"];
      const curves = el["curves"];
      delete el["at"];
      delete el["curves"];
      if (at !== undefined && Result.isFailure(decodeAt(at))) errors.push(`BadAt: ${scene["id"]}/${el["id"]}`);
      for (const [name, points] of Object.entries(asObj(curves))) {
        const r = decodeCurve(points);
        if (Result.isFailure(r)) errors.push(`BadCurve: ${scene["id"]}/${el["id"]}.${name}: ${String(r.failure).split("\n").find((l) => l.includes("strictly") || l.includes("needs") || l.includes("starts") || l.includes("outside")) ?? "invalid"}`.slice(0, 140));
      }
    }
  return { stripped: copy as Json, errors };
};

/** Story-level references the IR keeps as strings; 0004 checks them in the importer, not in the schema. */
const storyErrors = (g: Obj): string[] => {
  const errors: string[] = [];
  const scenes = (g["scenes"] as Obj[]) ?? [];
  const chapters = (g["chapters"] as Obj[]) ?? [];
  const sceneIds = scenes.map((s) => s["id"] as string);
  const chapterIds = chapters.map((c) => c["id"] as string);
  const dup = (xs: string[], what: string): void => {
    for (const x of new Set(xs.filter((v, i) => xs.indexOf(v) !== i))) errors.push(`Duplicate${what}: ${x}`);
  };
  dup(sceneIds, "SceneId");
  // The importer rejects these while parsing (spec 0004 `nameTaken`); `validateScene` does not, so a JSON IR needs them.
  for (const s of scenes) {
    dup(((s["elements"] as Obj[]) ?? []).map((e) => e["id"] as string), `ElementId(${s["id"]})`);
    dup([...((s["effects"] as Obj[]) ?? []).map((e) => e["id"] as string), ...((s["events"] as Obj[]) ?? []).map((e) => e["name"] as string)], `EffectOrEventName(${s["id"]})`);
  }
  dup(chapterIds, "ChapterId");
  for (const s of scenes) if (!chapterIds.includes(s["chapterId"] as string)) errors.push(`DanglingChapter: ${s["id"]} -> ${s["chapterId"]}`);
  // chapter.sceneIds repeats the order of the scenes (the IR keeps both): they must agree.
  const order = chapters.flatMap((c) => (c["sceneIds"] as string[]) ?? []);
  const wanted = scenes.map((s) => s["id"] as string);
  if (new Set(order).size === order.length && order.length === wanted.length && order.join() !== wanted.join()) errors.push(`ChapterOrder: ${order.join(",")} vs scenes ${wanted.join(",")}`);
  for (const c of chapters)
    for (const id of (c["sceneIds"] as string[]) ?? []) {
      if (!sceneIds.includes(id)) errors.push(`DanglingScene: ${c["id"]} -> ${id}`);
      else if (scenes.find((s) => s["id"] === id)?.["chapterId"] !== c["id"]) errors.push(`ChapterMismatch: ${c["id"]} lists ${id}`);
    }
  return errors;
};

/** Is `json` a valid IR: Effect Schema decode, then the cross-checks of 0004, then the story-level and stand-in ones. */
export const validate = (json: Json): Verdict => {
  const { stripped, errors } = split(asObj(json));
  const decoded = decodeGraph(stripped);
  if (Result.isFailure(decoded)) return { ok: false, errors: [`SchemaError: ${String(decoded.failure).split("\n")[0]}`, ...errors] };
  const scenes = decoded.success.scenes;
  for (const [i, scene] of scenes.entries()) {
    const previous = scenes[i - 1];
    // As `planScenes` of 0004: the identity diff against the previous Scene, only where Auto-Animate joins them.
    const identity = scene.transition === "auto-animate" && previous !== undefined ? identityDiff(previous.elements, scene.elements) : null;
    for (const e of validateScene({ ...scene, identity }))
        errors.push(`${e._tag}: ${scene.id}: ${e.message.split("\n")[0]}`.slice(0, 150));
  }
  errors.push(...storyErrors(stripped as Obj));
  return { ok: errors.length === 0, errors };
};

/** The canonical text of an IR, as the IR codec of 0004 writes it (two-space JSON in schema key order); stand-in fields are dropped. */
export const irText = (json: Json): string | undefined => {
  const { stripped } = split(asObj(json));
  const decoded = decodeGraph(stripped);
  return Result.isFailure(decoded) ? undefined : Result.match(jsonCodec.encode(decoded.success), { onFailure: () => undefined, onSuccess: (t) => t });
};
