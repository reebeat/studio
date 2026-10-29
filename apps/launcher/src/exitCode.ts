import { Cause, Exit } from "effect";
import type { Teardown } from "effect/Runtime";

// The server runs until it is stopped: Ctrl-C and SIGTERM interrupt the program, which is how it is meant to end, so an
// interruption is success (0). Any other failure is 1. (Effect's default teardown reports an interruption as 130.)
export const exitCodeOf = <E, A>(exit: Exit.Exit<E, A>): number =>
  Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause) ? 0 : 1;

export const teardown: Teardown = (exit, onExit) => {
  onExit(exitCodeOf(exit));
};
