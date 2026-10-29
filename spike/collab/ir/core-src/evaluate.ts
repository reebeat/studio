// Evaluating an event expression (spec 0004): the algebra of `combinators.ts` applied to an `EventExpr`, with the
// SOURCES left to the caller. `schedule` supplies the frames the Timeline resolves; the verifier supplies the frames it
// observed in the written video and audio, so the same expression is checked against the picture with one definition
// of `all`, `first`, `each`, `within`, offsets, `throttle` and `stagger`. A `let` name is evaluated once and shared.
// A source may need another event (an effect's start is the event of its own timing), so it receives the evaluator.
// Plain functions over `Result`.
import { Array as Arr, Match, Result } from "effect";

import {
  all,
  each,
  first,
  normalise,
  stagger,
  throttle,
  within,
} from "./combinators.ts";
import type { Event, Occurrence, Window } from "./combinators.ts";
import type { Anchor, Duration, EventExpr, Offset } from "./plan.ts";

/** Evaluates an event expression of the Scene being resolved. */
export type Evaluate<E> = (expr: EventExpr) => Result.Result<Event, E>;

/** What the caller knows: the frames of every source, the window of a State, and how a failure is reported. */
export interface Sources<E> {
  /** The occurrences of one source (a word, an edge or a state event of a machine). */
  readonly anchor: (
    anchor: Anchor,
    evaluate: Evaluate<E>
  ) => Result.Result<Event, E>;
  /** The interval of State `n` of the Scene. */
  readonly state: (
    n: number,
    evaluate: Evaluate<E>
  ) => Result.Result<Window, E>;
  /** A percent offset of an occurrence whose window is an instant. */
  readonly emptyWindow: (what: string) => E;
  /** Milliseconds as frames. */
  readonly frames: (ms: number) => number;
  /** A `let` name that is not declared, or that waits for itself. */
  readonly unresolved: (message: string) => E;
}

const gapFrames = <E>(sources: Sources<E>, duration: Duration): number =>
  duration.unit === "f" ? duration.value : sources.frames(duration.value);

const offsetFrames = <E>(
  sources: Sources<E>,
  offset: Offset,
  occurrence: Occurrence
): Result.Result<number, E> => {
  if (offset.unit === "f") {
    return Result.succeed(offset.value);
  }

  if (offset.unit === "flicks") {
    return Result.succeed(sources.frames(offset.value));
  }

  const width = occurrence.window.end - occurrence.window.start;

  return width === 0
    ? Result.fail(sources.emptyWindow(`offset ${offset.value}%`))
    : Result.succeed(Math.round((offset.value / 100) * width));
};

const operandsOf = <E>(
  event: Evaluate<E>,
  of: readonly EventExpr[]
): Result.Result<readonly Event[], E> => Result.all(Arr.map(of, event));

const shifted = <E>(
  sources: Sources<E>,
  event: Evaluate<E>,
  expr: Extract<EventExpr, { kind: "shift" }>
): Result.Result<Event, E> =>
  Result.flatMap(event(expr.of), (inner) =>
    Result.map(
      Result.all(
        Arr.map(inner, (occurrence) =>
          Result.map(
            offsetFrames(sources, expr.offset, occurrence),
            (by): Occurrence => ({
              frame: occurrence.frame + by,
              window: occurrence.window,
            })
          )
        )
      ),
      normalise
    )
  );

const grouped = <E>(
  sources: Sources<E>,
  event: Evaluate<E>,
  expr: Extract<EventExpr, { kind: "each" }>
): Result.Result<Event, E> =>
  Result.map(operandsOf(event, expr.of), (events) => {
    const merged = each(events);

    const thinned =
      expr.throttle === null
        ? merged
        : throttle(merged, gapFrames(sources, expr.throttle));

    return expr.stagger === null
      ? thinned
      : stagger(thinned, gapFrames(sources, expr.stagger));
  });

/**
 * The evaluator for one Scene's `let` lines (by name) over the caller's sources. The returned function evaluates an
 * expression; a `let` name is evaluated once and its list shared, and a name that waits for itself is `unresolved`.
 */
export const evaluator = <E>(
  sources: Sources<E>,
  lets: ReadonlyMap<string, EventExpr>
): Evaluate<E> => {
  const known = new Map<string, Event>();
  const active = new Set<string>();

  const event = (expr: EventExpr): Result.Result<Event, E> =>
    Match.value(expr).pipe(
      Match.discriminatorsExhaustive("kind")({
        all: (found) => Result.map(operandsOf(event, found.of), all),
        anchor: (found) => sources.anchor(found.anchor, event),
        each: (found) => grouped(sources, event, found),
        first: (found) => Result.map(operandsOf(event, found.of), first),
        ref: (found) => {
          const cached = known.get(found.name);
          const body = lets.get(found.name);

          if (cached !== undefined) {
            return Result.succeed(cached);
          }

          if (body === undefined) {
            return Result.fail(
              sources.unresolved(
                `no derived event "${found.name}" in this Scene`
              )
            );
          }

          if (active.has(found.name)) {
            return Result.fail(
              sources.unresolved(
                `derived event "${found.name}" waits for itself`
              )
            );
          }

          active.add(found.name);

          const result = event(body);

          active.delete(found.name);

          if (Result.isSuccess(result)) {
            known.set(found.name, result.success);
          }

          return result;
        },
        shift: (found) => shifted(sources, event, found),
        within: (found) =>
          Result.flatMap(sources.state(found.state, event), (window) =>
            Result.map(event(found.of), (inner) => within(inner, window))
          ),
      })
    );

  return event;
};

/** Folds an expression over its operands: what each kind of node contributes, left to right. */
const fold = <A>(
  expr: EventExpr,
  leaf: (found: Extract<EventExpr, { kind: "anchor" | "ref" }>) => readonly A[],
  extra: (found: Extract<EventExpr, { kind: "within" }>) => readonly A[]
): readonly A[] =>
  Match.value(expr).pipe(
    Match.discriminatorsExhaustive("kind")({
      all: (found) =>
        Arr.flatMap(found.of, (operand) => fold(operand, leaf, extra)),
      anchor: leaf,
      each: (found) =>
        Arr.flatMap(found.of, (operand) => fold(operand, leaf, extra)),
      first: (found) =>
        Arr.flatMap(found.of, (operand) => fold(operand, leaf, extra)),
      ref: leaf,
      shift: (found) => fold(found.of, leaf, extra),
      within: (found) => [...extra(found), ...fold(found.of, leaf, extra)],
    })
  );

/** Every source an expression names, left to right. */
export const anchorsOf = (expr: EventExpr): readonly Anchor[] =>
  fold(
    expr,
    (found) => (found.kind === "anchor" ? [found.anchor] : []),
    () => []
  );

/** The `let` names an expression uses. */
export const refsOf = (expr: EventExpr): readonly string[] =>
  fold(
    expr,
    (found) => (found.kind === "ref" ? [found.name] : []),
    () => []
  );

/** The States an expression is scoped to with `within`, left to right. */
export const statesOf = (expr: EventExpr): readonly number[] =>
  fold(
    expr,
    () => [],
    (found) => [found.state]
  );
