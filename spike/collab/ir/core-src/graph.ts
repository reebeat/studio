// The canonical intermediate representation (IR) of a Story: the state and beat graph, as a closed, versioned Effect
// Schema (spec 0004). A Story declares what the viewer sees (Elements, the sets of Elements that make a State),
// how the narration is cut into Lines, and which effects and derived events subscribe to the events the engine
// generates from the graph. The Plan is a function of it (`planOf`: identity diff, settings), and every format is one
// of three kinds, kept apart in the types:
//
//   IrCodec<Encoded>          encode and decode, with the law `decode(encode(ir))` equals `ir`; JSON is the canonical one
//   Importer<Foreign>         a foreign format into the IR, one way, may lose information, its output reviewed; the
//                             Fountain reader is one
//   ArtifactRenderer<Output>  the IR out to an artifact, never read back: the Video, the Deck, subtitles
//
// An artifact has no `decode` and an importer has no `encode`, so nothing can be read back that is not a codec. A change
// of the IR is a new `version`, and a migration is a codec between two versions. Plain data and plain functions.
import { Schema, Struct } from "effect";
import type { Array as Arr, Result } from "effect";

import type { PlanError } from "./errors.ts";
import { ChapterSchema, SceneSchema, SpeedSchema } from "./plan.ts";

/** The version of the IR this build reads and writes. */
export const graphVersion = 1;

/** A Scene as declared: its Elements, Lines, effects and derived events. Its identity diff is derived, not declared. */
export const GraphSceneSchema = SceneSchema.mapFields(
  Struct.omit(["identity"])
);

/** The IR of a Story: closed (an unknown key is a decode error) and versioned. */
export const GraphSchema = Schema.Struct({
  author: Schema.optionalKey(Schema.String),
  chapters: Schema.Array(ChapterSchema),
  scenes: Schema.Array(GraphSceneSchema),
  /** The story's default speech rate (`Speed:` of the title page). */
  speed: SpeedSchema,
  title: Schema.String,
  version: Schema.Literal(graphVersion),
});

export type Graph = typeof GraphSchema.Type;

export type GraphScene = typeof GraphSceneSchema.Type;

/** What a failed import carries: every error found, in document order. */
export type ImportErrors = Arr.NonEmptyReadonlyArray<PlanError>;

/** A codec: the IR to an encoded form and back, losing nothing. */
export interface IrCodec<Encoded> {
  readonly decode: (
    encoded: Encoded
  ) => Result.Result<Graph, Schema.SchemaError>;
  readonly encode: (graph: Graph) => Result.Result<Encoded, Schema.SchemaError>;
}

/** An importer: a foreign format into the IR. One way; what it cannot carry is lost, and its output is reviewed. */
export interface Importer<Foreign> {
  readonly import: (foreign: Foreign) => Result.Result<Graph, ImportErrors>;
}

/** An artifact renderer: the IR out to an artifact. It has no inverse. */
export interface ArtifactRenderer<Output> {
  readonly render: (graph: Graph) => Output;
}

const graphJson = Schema.fromJsonString(GraphSchema, { space: 2 });

/** The canonical codec: JSON text, two-space indent. An excess key or another version is a decode error. */
export const jsonCodec: IrCodec<string> = {
  decode: Schema.decodeUnknownResult(graphJson, { onExcessProperty: "error" }),
  encode: Schema.encodeResult(graphJson),
};
