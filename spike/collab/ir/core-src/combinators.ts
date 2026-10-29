// The algebra of events (spec 0004). Time is an integer frame; an EVENT is a finite list of OCCURRENCES in strictly
// increasing frame order, each with the window of the thing it came from (an instant when start equals end). Every
// combinator is a total function from such lists to such a list, so an author's expression resolves at plan time and
// cannot fail inside the algebra; whether an empty result is an error is the caller's business. Names follow SMIL 3.0
// timing for what happens and the reactive vocabulary for what it is:
//
//   all       SMIL `endsync="all"`, `forkJoin`   the last occurrence of every operand, when every operand has one
//   first     SMIL `endsync="first"`, `race`      the earliest occurrence of any operand
//   each      a begin-value list, `merge`         every occurrence of every operand
//   within    scoping                             the occurrences inside a window (a Beat)
//   throttle  `throttle` (leading edge)           drop an occurrence closer than a gap to the last one kept
//   stagger   `concatMap(delay)`                  push an occurrence later so none is closer than a gap
//   endsAfter SMIL end value, `takeUntil`         the first end occurrence after a start, else a fallback
//
// An offset moves every occurrence by its own amount and is applied by `evaluate.ts`. Marble notation in the tests and
// in spec 0004 draws one column per frame. Plain functions.
import { Array as Arr, Option, Order } from "effect";

/** The frames of an event of the picture: `end >= start`; equal means an instant. */
export interface Window {
  readonly end: number;
  readonly start: number;
}

/** One happening: its frame, and the window of the anchored thing (for a percent offset). */
export interface Occurrence {
  readonly frame: number;
  readonly window: Window;
}

/** Occurrences in strictly increasing frame order. The empty list is an event that never happens. */
export type Event = readonly Occurrence[];

const byFrame = Order.mapInput(Order.Number, ({ frame }: Occurrence) => frame);

const none: Event = [];

/** Sorts occurrences by frame and keeps the first of any that share a frame. */
export const normalise = (occurrences: readonly Occurrence[]): Event =>
  Arr.dedupeWith(
    Arr.sort(occurrences, byFrame),
    (left, right) => left.frame === right.frame
  );

/** One occurrence at `frame`; its window is the instant `frame` unless one is given. */
export const once = (frame: number, window?: Window): Event => [
  { frame, window: window ?? { end: frame, start: frame } },
];

/** `all`: the latest of the last occurrences of the operands, when each has one; otherwise never. */
export const all = (operands: readonly Event[]): Event => {
  const lasts = Arr.flatMap(operands, (operand) => Arr.takeRight(operand, 1));

  return operands.length > 0 && lasts.length === operands.length
    ? Arr.take(Arr.sort(lasts, Order.flip(byFrame)), 1)
    : [];
};

/** `first`: the earliest of the first occurrences of the operands that have one. */
export const first = (operands: readonly Event[]): Event =>
  Arr.take(
    Arr.sort(
      Arr.flatMap(operands, (operand) => Arr.take(operand, 1)),
      byFrame
    ),
    1
  );

/** `each`: every occurrence of every operand, in time order, a frame once. */
export const each = (operands: readonly Event[]): Event =>
  normalise(Arr.flatten(operands));

/** `within`: the occurrences whose frame lies in the window, both ends included. */
export const within = (event: Event, window: Window): Event =>
  Arr.filter(
    event,
    ({ frame }) => frame >= window.start && frame <= window.end
  );

/** `throttle`: keeps the first occurrence, then each one at least `gap` frames after the last one kept. */
export const throttle = (event: Event, gap: number): Event =>
  Arr.reduce(event, none, (kept, occurrence) =>
    Option.match(Arr.last(kept), {
      onNone: () => [occurrence],
      onSome: (last) =>
        occurrence.frame - last.frame < gap ? kept : [...kept, occurrence],
    })
  );

/** `stagger`: keeps the first occurrence, then moves each later one to at least `gap` frames after the one before it. */
export const stagger = (event: Event, gap: number): Event =>
  Arr.reduce(event, none, (placed, occurrence) => [
    ...placed,
    {
      frame: Option.match(Arr.last(placed), {
        onNone: () => occurrence.frame,
        onSome: (last) => Math.max(occurrence.frame, last.frame + gap),
      }),
      window: occurrence.window,
    },
  ]);

/**
 * `endsAfter`: the SMIL end value of an instance that begins at `begin`: the first occurrence of `ends` strictly after
 * it, and `fallback` (the end of the Scene: the parent ends its children) when there is none, or when it comes after
 * the fallback. An occurrence at or before the beginning is not an end. `interrupted` says the fallback ended it.
 */
export const endsAfter = (
  begin: number,
  ends: Event,
  fallback: number
): { readonly frame: number; readonly interrupted: boolean } =>
  Option.match(
    Arr.findFirst(ends, ({ frame }) => frame > begin && frame <= fallback),
    {
      onNone: () => ({ frame: fallback, interrupted: true }),
      onSome: ({ frame }) => ({ frame, interrupted: false }),
    }
  );
