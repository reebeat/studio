// The speech rate (spec 0001, Revision "operator feedback after viewing the video"): a story default from the title
// page key `Speed:`, a per-Line `(speed N)`, and the presets `(slowly)` and `(quickly)` relative to the default.
// Plain functions: a rate is a number in [`minSpeed`, `maxSpeed`] and nothing else.
import { Result, String as Str } from "effect";

/** The slowest and the fastest rate the narrator is asked for. */
export const minSpeed = 0.5;

export const maxSpeed = 2;

/** The story default when the title page has no `Speed:`; the first release's voice was slightly slow at 1.0. */
export const defaultSpeed = 1.1;

/** `(slowly)` and `(quickly)`: the story default times these, clamped to the range. */
export const slowFactor = 0.9;

export const quickFactor = 1.1;

const numberPattern = /^\d+(?:\.\d+)?$/u;

/** A decimal number inside the range, or what is wrong with the text. */
export const parseSpeed = (text: string): Result.Result<number, string> => {
  const trimmed = Str.trim(text);

  if (!numberPattern.test(trimmed)) {
    return Result.fail(
      `"${trimmed}" is not a number: write a rate from ${minSpeed} to ${maxSpeed}, for example 1.1`
    );
  }

  const value = Number(trimmed);

  return value >= minSpeed && value <= maxSpeed
    ? Result.succeed(value)
    : Result.fail(`${trimmed} is outside the range ${minSpeed} to ${maxSpeed}`);
};

/** `base` times `factor`, rounded to four decimals (so 1.1 times 1.1 is 1.21) and clamped to the range. */
export const scaleSpeed = (base: number, factor: number): number =>
  Math.min(
    maxSpeed,
    Math.max(minSpeed, Math.round(base * factor * 10_000) / 10_000)
  );
