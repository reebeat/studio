// Lookups by id in a Scene, with `undefined` for a miss (the callers branch on it). Plain functions.
import { Array as Arr, Option } from "effect";

import type { Effect, Element, Scene } from "./plan.ts";

/** The Element of a Scene with this id. */
export const elementOf = (scene: Scene, id: string): Element | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(scene.elements, (element) => element.id === id)
  );

/** The effect of a Scene with this id. */
export const effectOf = (scene: Scene, id: string): Effect | undefined =>
  Option.getOrUndefined(
    Arr.findFirst(scene.effects, (effect) => effect.id === id)
  );
