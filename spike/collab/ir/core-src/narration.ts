// Dialogue text to narration text and words (spec 0002: dialogue is prose, byte for byte what is spoken and
// subtitled, so it contains no `[[...]]` at all). A note in dialogue is a release-1 cue: it is returned with its
// position, and the Scene (`hints.ts`) turns it into an error that carries the replacement. A plain function.

import { Array as Arr, Option, String as Str, pipe } from "effect";

import { planError } from "./errors.ts";
import type { PlanError } from "./errors.ts";
import { problem } from "./grammar.ts";

/** A release-1 cue `[[...]]` in dialogue: what it says, where it stands, and how many words of its Line come before. */
export interface LegacyCue {
  readonly inner: string;
  readonly line: number;
  readonly wordsBefore: number;
}

export interface Narration {
  /** The release-1 cues of the Line, in order; the Scene turns them into errors that carry a replacement. */
  readonly cues: readonly LegacyCue[];
  readonly errors: readonly PlanError[];
  readonly text: string;
  readonly words: readonly string[];
}

const notePattern = /\[\[(?<inner>[\s\S]*?)\]\]/gu;

/** The same pattern as a split: the capture puts the inner text of each note at an odd position of the result. */
const notePart = new RegExp(notePattern.source, "u");

/** `[[` and `]]` around the inner text of a note. */
const noteBracketLength = 4;

const collapse = (text: string): string =>
  pipe(text, Str.replaceAll(/\s+/gu, " "), Str.trim);

const wordsOf = (text: string): readonly string[] =>
  text === "" ? [] : Str.split(text, " ");

/** The 1-based source line of `offset` in a dialogue text whose first line is `firstLine`. */
const lineAt = (text: string, offset: number, firstLine: number): number =>
  firstLine + pipe(text, Str.slice(0, offset), Str.split("\n")).length - 1;

/**
 * Splits the dialogue of one Line. `text` is the token text (lines joined by `\n`); `firstLine` is the source line
 * of its first line. Every `[[...]]` is an error with its replacement; the narration is the text without them.
 */
export const parseNarration = (text: string, firstLine: number): Narration => {
  const errors: PlanError[] = [];
  const cues: LegacyCue[] = [];
  let before = "";
  let offset = 0;

  for (const [index, part] of Str.split(text, notePart).entries()) {
    if (index % 2 === 0) {
      before += part;
      offset += part.length;
    } else {
      cues.push({
        inner: collapse(part),
        line: lineAt(text, offset, firstLine),
        wordsBefore: wordsOf(collapse(before)).length,
      });
      offset += part.length + noteBracketLength;
    }
  }

  const masked = Arr.join(
    Arr.map(Str.split(text, notePart), (part, index) =>
      index % 2 === 1 ? Str.replaceAll(/[^\n]/gu, " ")(`[[${part}]]`) : part
    ),
    ""
  );

  const stray = Str.search(masked, /\[\[|\]\]/u);

  if (Option.isSome(stray)) {
    errors.push(
      planError(
        "ReleaseOneForm",
        lineAt(text, stray.value, firstLine),
        problem(
          "unbalanced [[ or ]] in dialogue",
          "no note in dialogue; effects live in the [[effects]] block of the Scene"
        )
      )
    );
  }

  const emphasis = Str.search(masked, /[*_]/u);

  if (Option.isSome(emphasis)) {
    errors.push(
      planError(
        "EmphasisInDialogue",
        lineAt(text, emphasis.value, firstLine),
        problem(
          "emphasis markers (* and _) in dialogue",
          "plain words: narration, subtitles and notes are one string"
        )
      )
    );
  }

  const narration = collapse(Str.replaceAll(notePattern, "")(text));

  return { cues, errors, text: narration, words: wordsOf(narration) };
};
