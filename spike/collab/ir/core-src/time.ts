// Time (spec 0004). The IR holds EXACT time, independent of the frame rate: a whole number of FLICKS, 1/705,600,000 of
// a second. A flick divides evenly into one frame of 24, 25, 30, 48, 50, 60 and 120 fps (and of 44.1 and 48 kHz audio
// samples), so an offset such as `+0.1s` is 70,560,000 flicks exactly, never a float, and the same IR means the same
// time at every rate. A FRAME exists only at render time, at the Plan's `fps` (`Settings.fps`, nominal, and `ntsc`, the
// 1000/1001 fraction: 24000/1001 and 30000/1001):
//
//   frame = floor(t x rate + 1/2)     the NEAREST frame, a half going to the later one (the rule of 0001 and 0002)
//
// computed in integers (BigInt), so no float rounds a half the wrong way. Plain functions.
import type { RendererLifecycle, Settings } from "./plan.ts";

/** Flicks in one second (Facebook's `flicks`). */
export const flicksPerSecond = 705_600_000;

/** A frame rate as a rational: `num` frames in `den` seconds. */
export interface Rate {
  readonly den: number;
  readonly num: number;
}

/** The exact frame rate of a Plan: `fps`, or `fps` x 1000/1001 when `ntsc`. */
export const rateOf = (settings: Pick<Settings, "fps" | "ntsc">): Rate =>
  settings.ntsc
    ? { den: 1001, num: settings.fps * 1000 }
    : { den: 1, num: settings.fps };

/** The frame nearest to `flicks` from the start, at `rate`; a half goes to the later frame (toward +infinity). */
export const framesOfFlicks = (rate: Rate, flicks: number): number => {
  const whole = BigInt(Math.round(flicks));
  const second = BigInt(flicksPerSecond);
  const numerator = 2n * whole * BigInt(rate.num) + BigInt(rate.den) * second;
  const divisor = 2n * BigInt(rate.den) * second;
  const quotient = numerator / divisor;

  return Number(
    numerator % divisor !== 0n && numerator < 0n ? quotient - 1n : quotient
  );
};

/** Seconds as flicks, to the nearest flick. */
export const flicksOfSeconds = (seconds: number): number =>
  Math.round(seconds * flicksPerSecond);

/** Milliseconds as flicks (705,600 each). */
export const flicksOfMilliseconds = (milliseconds: number): number =>
  Math.round(milliseconds * (flicksPerSecond / 1000));

/** A number of frames at `fps` as flicks: the time a lag that was measured in frames lasts. */
export const flicksOfFrames = (fps: number, frames: number): number =>
  Math.round((frames * flicksPerSecond) / fps);

/** What a renderer's declared lifecycle is, in frames at the Plan's rate: the same times, resolved by one rule. */
export interface LifecycleFrames {
  /** The last frame, after the slide change, of an unmatched Element's enter (Auto-Animate). */
  readonly enterEnd: number;
  /** The first frame, after the slide change, of an unmatched Element's enter (Auto-Animate). */
  readonly enterStart: number;
  /** The frames after the slide change at which a matched Element starts to move or change. */
  readonly matchedStart: number;
  /** The frames a `show` takes. */
  readonly show: number;
  /** The frames each kind of slide change takes. */
  readonly transition: Readonly<
    Record<keyof RendererLifecycle["transitionMs"], number>
  >;
}

/** The declared lifecycle at the Plan's rate: a lag measured in frames at `measuredFps` is the same time here. */
export const lifecycleFrames = (
  settings: Pick<Settings, "fps" | "ntsc">,
  lifecycle: RendererLifecycle
): LifecycleFrames => {
  const rate = rateOf(settings);

  const lag = (frames: number): number =>
    framesOfFlicks(rate, flicksOfFrames(lifecycle.measuredFps, frames));

  const time = (ms: number): number =>
    framesOfFlicks(rate, flicksOfMilliseconds(ms));

  return {
    enterEnd: lag(lifecycle.unmatched.enter.endLagFrames),
    enterStart: lag(lifecycle.unmatched.enter.startLagFrames),
    matchedStart: lag(lifecycle.matched.startLagFrames),
    show: time(lifecycle.showMs),
    transition: {
      "auto-animate": time(lifecycle.transitionMs["auto-animate"]),
      cut: time(lifecycle.transitionMs.cut),
      default: time(lifecycle.transitionMs.default),
    },
  };
};
