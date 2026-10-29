// The identity diff of release 1 (GLOSSARY, "Identity diff"): two consecutive Scenes joined by `> AUTO-ANIMATE`
// are compared by Element `id`. An id only in the second Scene enters, only in the first exits, in both updates
// (when `cell`, `class` or `text` differ) or stays the same. A plain function.
import { Array as Arr, Option } from "effect";

import type { Element, Identity } from "./plan.ts";

type Changes = Identity["update"][number]["changes"];

/** The properties of `after` that differ from `before`, in the order `cell`, `class`, `text`. */
const changesOf = (before: Element, after: Element): Changes => [
  ...(before.cell === after.cell ? [] : (["cell"] as const)),
  ...(before.class === after.class ? [] : (["class"] as const)),
  ...(before.text === after.text ? [] : (["text"] as const)),
];

const idOf = (element: Element): string => element.id;

/** Compares the Elements of `previous` with those of `current`. Ids keep the document order of their own Scene. */
export const identityDiff = (
  previous: readonly Element[],
  current: readonly Element[]
): Identity => {
  const before = new Map(Arr.map(previous, (element) => [element.id, element]));
  const after = new Set(Arr.map(current, idOf));
  const update: Identity["update"][number][] = [];
  const same: string[] = [];

  for (const element of current) {
    const earlier = Option.fromNullishOr(before.get(element.id));

    if (Option.isSome(earlier)) {
      const changes = changesOf(earlier.value, element);

      if (changes.length === 0) {
        same.push(element.id);
      } else {
        update.push({ changes, id: element.id });
      }
    }
  }

  return {
    enter: Arr.flatMap(current, (element) =>
      before.has(element.id) ? [] : [element.id]
    ),
    exit: Arr.flatMap(previous, (element) =>
      after.has(element.id) ? [] : [element.id]
    ),
    same,
    update,
  };
};
