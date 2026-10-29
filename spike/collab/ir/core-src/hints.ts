// The release-1 cues of one Scene as errors that write their replacement (spec 0002, F4). A note in dialogue
// (`[[next]]`, `[[focus: id]]`, `[[sfx: name]]`) is an error, and its message holds the effect line that replaces it,
// written so that applying every message of a Scene as it stands gives a Scene with no error:
//
//   - the effect ids are numbered per Scene in document order by verb (`s1`, `s2`, `r1`, `f1`), never repeated;
//   - the word it anchors to is the last word before the cue, in this Line or in the Line before it (the cue
//     opened a Line), with the occurrence number when the phrase repeats in the Scene's narration;
//   - `[[next]]` names the Element it revealed: the k-th hidden Element of the Scene for the k-th `[[next]]`;
//   - a cue before the first word of the Scene is the slide change for a sound and the first word for the rest.
//
// Plain functions over the Scene's drafts.
import { Array as Arr, Option, String as Str } from "effect";

import { formatAnchor } from "./anchors.ts";
import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import {
  effectLine,
  problem,
  releaseOneCues,
  verbArguments,
} from "./grammar.ts";
import type { LegacyCue } from "./narration.ts";
import type { Anchor, Verb } from "./plan.ts";
import { findPhrase } from "./words.ts";

/** A release-1 cue and the index, in the Scene's Lines, of the Line that holds it. */
export interface SceneCue extends LegacyCue {
  readonly lineIndex: number;
}

/** What the replacement of a Scene's cues reads about the Scene. */
export interface CueScene {
  readonly cues: readonly SceneCue[];
  /** The effects the Scene already has: their ids are taken. */
  readonly effects: readonly { readonly id: string }[];
  /** The ids of the release-1 `hidden` Elements, in document order. */
  readonly hidden: readonly string[];
  readonly lines: readonly { readonly words: readonly string[] }[];
}

/** A word as an anchor names it: without the punctuation around it. */
const usable = (word: string): string =>
  Str.replaceAll(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")(word);

interface WordAt {
  readonly line: number;
  readonly word: number;
}

/** The last word with letters or digits before the cue: in its own Line, or at the end of the Line before. */
const wordBefore = (
  lines: CueScene["lines"],
  cue: SceneCue
): WordAt | undefined => {
  for (
    let line = Math.min(cue.lineIndex, lines.length - 1);
    line >= 0;
    line -= 1
  ) {
    const words = lines[line]?.words ?? [];

    const end =
      line === cue.lineIndex
        ? Math.min(cue.wordsBefore, words.length)
        : words.length;

    for (let word = end - 1; word >= 0; word -= 1) {
      if (usable(words[word] ?? "") !== "") {
        return { line, word };
      }
    }
  }

  return undefined;
};

/** The first word of the Scene's narration with letters or digits. */
const firstWord = (lines: CueScene["lines"]): WordAt | undefined => {
  for (const [line, { words }] of lines.entries()) {
    const word = Arr.findFirstIndex(words, (found) => usable(found) !== "");

    if (Option.isSome(word)) {
      return { line, word: word.value };
    }
  }

  return undefined;
};

/** The anchor on one word of the narration as written: the occurrence is there when the phrase repeats in the Scene. */
const wordAnchor = (
  lines: CueScene["lines"],
  at: WordAt,
  edge: Extract<Anchor, { kind: "word" }>["edge"]
): string => {
  const phrase = usable(lines[at.line]?.words[at.word] ?? "");
  const found = findPhrase(lines, phrase);

  const index = Arr.findFirstIndex(
    found,
    (match) => match.line === at.line && match.to === at.word
  );

  return formatAnchor(
    {
      edge,
      explicit: false,
      kind: "word",
      occurrence: Option.getOrElse(index, () => 0) + 1,
      phrase,
    },
    found.length > 1
  );
};

/** What the cue was timed against, as the effect line writes it; `undefined` when the Scene has no word at all. */
const whenOf = (
  scene: CueScene,
  cue: SceneCue,
  verb: Verb
): string | undefined => {
  const before = wordBefore(scene.lines, cue);

  if (before !== undefined) {
    return wordAnchor(scene.lines, before, "end");
  }

  if (verb === "sound") {
    return formatAnchor({
      at: "start",
      kind: "edge",
      subject: { kind: "scene" },
      transition: "transition",
    });
  }

  const first = firstWord(scene.lines);

  return first === undefined
    ? undefined
    : wordAnchor(scene.lines, first, "start");
};

type Drafted =
  | {
      readonly argument: string;
      readonly kind: "effect";
      readonly verb: Verb;
    }
  | { readonly kind: "remove"; readonly reason: string };

const removeIt =
  "remove it: effects live in the [[effects]] block of the Scene";

/** The verb and argument a cue stood for; `next` takes the next hidden Element of the Scene. */
const draftOf = (inner: string, hidden: string | undefined): Drafted => {
  if (inner === releaseOneCues.next) {
    return hidden === undefined
      ? {
          kind: "remove",
          reason: `no hidden Element is left for it to show; ${removeIt}`,
        }
      : { argument: hidden, kind: "effect", verb: "show" };
  }

  const focus = releaseOneCues.focus.exec(inner)?.groups?.id;

  if (focus !== undefined) {
    return { argument: focus, kind: "effect", verb: "focus" };
  }

  const sfx = releaseOneCues.sfx.exec(inner)?.groups?.name;

  return sfx === undefined
    ? { kind: "remove", reason: removeIt }
    : { argument: sfx, kind: "effect", verb: "sound" };
};

/** The next free id of a verb's series in the Scene (`s1`, `s2`, ...), taken from then on. */
const takeId = (taken: Set<string>, verb: Verb): string => {
  const { idPrefix } = verbArguments[verb];
  let number = 1;

  while (taken.has(`${idPrefix}${number}`)) {
    number += 1;
  }

  taken.add(`${idPrefix}${number}`);

  return `${idPrefix}${number}`;
};

/** What follows `no note in dialogue;` in the message: the effect line that replaces the cue, or why to remove it. */
const replacementOf = (
  scene: CueScene,
  cue: SceneCue,
  drafted: Drafted,
  taken: Set<string>
): string => {
  if (drafted.kind === "remove") {
    return drafted.reason;
  }

  const when = whenOf(scene, cue, drafted.verb);

  return when === undefined
    ? removeIt
    : `write ${effectLine(takeId(taken, drafted.verb), drafted.verb, drafted.argument, when)} in the [[effects]] block of the Scene`;
};

/** One error per release-1 cue of the Scene, in document order, each writing its replacement. */
export const cueErrors = (scene: CueScene): readonly PlanError[] => {
  const taken = new Set(Arr.map(scene.effects, ({ id }) => id));
  let revealed = 0;

  return Arr.map(scene.cues, (cue) => {
    const isNext = cue.inner === releaseOneCues.next;

    const drafted = draftOf(
      cue.inner,
      isNext ? scene.hidden[revealed] : undefined
    );

    revealed += isNext ? 1 : 0;

    return planError(
      "ReleaseOneForm",
      cue.line,
      problem(
        `release-1 cue [[${cue.inner}]] in dialogue`,
        `no note in dialogue; ${replacementOf(scene, cue, drafted, taken)}`
      )
    );
  });
};
