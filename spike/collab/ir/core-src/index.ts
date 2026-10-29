// Public surface of @reebeat/core: Fountain source to Plan, Plan plus aligned words to Timeline, Plan to review
// text. Pure: no browser, no ffmpeg, no reveal.js, no Node built-in (spec 0001, F11).
export { alignWords, matchThreshold, normaliseWord } from "./align.ts";

export type { Alignment, HeardWord, WordSpan } from "./align.ts";

export { buildPlan, collectErrors, fountainImporter, planOf } from "./build.ts";

export { GraphSchema, graphVersion, jsonCodec } from "./graph.ts";

export type {
  ArtifactRenderer,
  Graph,
  GraphScene,
  ImportErrors,
  Importer,
  IrCodec,
} from "./graph.ts";

export { formatAnchor } from "./anchors.ts";

export { formatEffect, formatLet, parseEffectLine } from "./effects.ts";

export { anchorsOf, evaluator, refsOf, statesOf } from "./evaluate.ts";

export type { Evaluate, Sources } from "./evaluate.ts";

export { endsAfter, once } from "./combinators.ts";

export type { Event, Occurrence, Window } from "./combinators.ts";

export { formatEvent } from "./expr.ts";

export { machines, vocabulary } from "./machines.ts";

export type { Form, Machine } from "./machines.ts";

export { initialState } from "./events.ts";

export { occupancies, stateEvent } from "./occupancy.ts";

export {
  flicksOfFrames,
  flicksOfMilliseconds,
  flicksOfSeconds,
  flicksPerSecond,
  framesOfFlicks,
  lifecycleFrames,
  rateOf,
} from "./time.ts";

export type { LifecycleFrames, Rate } from "./time.ts";

export * from "./errors.ts";

export * from "./grammar.ts";

export * from "./plan.ts";

export { reviewText } from "./review.ts";

export type { ReviewOptions } from "./review.ts";

export { AlignedLineSchema, schedule } from "./schedule.ts";

export type { AlignedLine } from "./schedule.ts";

export { frameToMs, linesById, requireTimeline } from "./timed.ts";

export type { TimedPlan } from "./timed.ts";

export { audioClipToWav } from "./wav.ts";

export { eventKind, hasWindow, showEffectOf } from "./events.ts";

export type { EventKind } from "./events.ts";

export { commandOf, timeOfProgress } from "./resolve.ts";

export { soundsOf, stepsOf } from "./steps.ts";

export type { CarriedSound, Carrier, Step } from "./steps.ts";

export { findPhrase } from "./words.ts";

export { grammarDocument } from "./grammarDoc.ts";
