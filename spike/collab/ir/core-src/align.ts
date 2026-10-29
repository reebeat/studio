// Word alignment (spec 0001, "Speech"): whisper hears the narration and returns words with times; the Line says
// which words it meant. The two are matched by a dynamic-programming longest common subsequence over normalised
// words, so a misheard word, an extra word or a spelling difference moves no other word. A word that has no
// partner gets a time interpolated between its neighbours. Plain functions: total and deterministic.
import { Array as Arr, Record, String as Str, pipe } from "effect";

/** A word whisper heard, with its time span in the audio. */
export interface HeardWord {
  readonly endMs: number;
  readonly startMs: number;
  readonly w: string;
}

/** The time span of one Line word. */
export interface WordSpan {
  readonly endMs: number;
  readonly startMs: number;
}

/** The result of `alignWords`. */
export interface Alignment {
  /** The Dice ratio `2 * matched / (line words + heard words)` of the normalised words, in [0, 1]. */
  readonly match: number;
  /** One span per Line word. */
  readonly words: readonly WordSpan[];
}

/** The smallest match ratio of a trusted alignment. */
export const matchThreshold = 0.9;

// US spelling is the normal form; the map is closed on purpose (a general stemmer would match wrong words).
const spelling = new Map<string, string>(
  Record.toEntries({
    analyse: "analyze",
    behaviour: "behavior",
    centre: "center",
    colour: "color",
    colours: "colors",
    defence: "defense",
    favourite: "favorite",
    grey: "gray",
    honour: "honor",
    humour: "humor",
    labour: "labor",
    neighbour: "neighbor",
    organise: "organize",
    realise: "realize",
    recognise: "recognize",
    travelling: "traveling",
  })
);

// Numerals are compared as the words a narrator says.
const numerals = new Map<string, string>(
  Record.toEntries({
    "0": "zero",
    "1": "one",
    "10": "ten",
    "11": "eleven",
    "12": "twelve",
    "13": "thirteen",
    "14": "fourteen",
    "15": "fifteen",
    "16": "sixteen",
    "17": "seventeen",
    "18": "eighteen",
    "19": "nineteen",
    "2": "two",
    "20": "twenty",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
  })
);

// Ordinals the same way: whisper writes "1st", the script says "first", and each compares as the word.
const ordinals = new Map<string, string>(
  Record.toEntries({
    "10th": "tenth",
    "1st": "first",
    "2nd": "second",
    "3rd": "third",
    "4th": "fourth",
    "5th": "fifth",
    "6th": "sixth",
    "7th": "seventh",
    "8th": "eighth",
    "9th": "ninth",
  })
);

/** The comparison form of a word: lower case, letters and digits only, US spelling, numerals and ordinals as words. */
export const normaliseWord = (word: string): string => {
  const plain = pipe(word, Str.toLowerCase, Str.replaceAll(/[^a-z0-9]/gu, ""));

  return (
    numerals.get(plain) ?? ordinals.get(plain) ?? spelling.get(plain) ?? plain
  );
};

/** The longest-common-subsequence lengths of every pair of prefixes, row by row. */
const lengths = (
  reference: readonly string[],
  heard: readonly string[]
): ((row: number, column: number) => number) => {
  const columns = heard.length + 1;
  const table = new Uint32Array((reference.length + 1) * columns);

  const at = (row: number, column: number): number =>
    table[row * columns + column] ?? 0;

  for (let row = 1; row <= reference.length; row += 1) {
    for (let column = 1; column <= heard.length; column += 1) {
      table[row * columns + column] =
        reference[row - 1] === heard[column - 1]
          ? at(row - 1, column - 1) + 1
          : Math.max(at(row - 1, column), at(row, column - 1));
    }
  }

  return at;
};

/** The index of the heard word each matched reference word is paired with. */
const matchPairs = (
  reference: readonly string[],
  heard: readonly string[]
): ReadonlyMap<number, number> => {
  const at = lengths(reference, heard);
  const pairs = new Map<number, number>();

  let row = reference.length;
  let column = heard.length;

  while (row > 0 && column > 0) {
    if (reference[row - 1] === heard[column - 1]) {
      pairs.set(row - 1, column - 1);
      row -= 1;
      column -= 1;
    } else if (at(row - 1, column) >= at(row, column - 1)) {
      row -= 1;
    } else {
      column -= 1;
    }
  }

  return pairs;
};

/**
 * Gives the Line words after the last span and before index `upTo` their time: the gap between the end of the
 * last span and `rightMs`, shared in proportion to word length. Appends to `spans`, which `alignWords` owns.
 */
const spreadGap = (
  spans: WordSpan[],
  words: readonly string[],
  upTo: number,
  rightMs: number
): void => {
  const from = spans.length;
  const left = spans.at(-1)?.endMs ?? 0;
  const right = Math.max(left, rightMs);

  const weights = Arr.map(words.slice(from, upTo), (word) =>
    Math.max(1, word.length)
  );

  const total = Arr.reduce(weights, 0, (sum, weight) => sum + weight);
  let before = 0;

  for (const weight of weights) {
    spans.push({
      endMs: left + Math.round(((right - left) * (before + weight)) / total),
      startMs: left + Math.round(((right - left) * before) / total),
    });
    before += weight;
  }
};

/** Forces the spans into [0, durationMs], each starting no earlier than the previous one ends. */
const enforceOrder = (
  spans: readonly WordSpan[],
  durationMs: number
): readonly WordSpan[] => {
  let previousEnd = 0;

  return Arr.map(spans, (span) => {
    const startMs = Math.min(Math.max(span.startMs, previousEnd), durationMs);
    const endMs = Math.min(Math.max(span.endMs, startMs), durationMs);

    previousEnd = endMs;

    return { endMs, startMs };
  });
};

/**
 * Aligns the words of a Line to the words whisper heard.
 *
 * `words` are 1:1 with `lineWords`; times are whole milliseconds, within [0, durationMs], each word starting no
 * earlier than the previous one ends. Below `matchThreshold` the alignment is not to be trusted.
 */
export const alignWords = (
  lineWords: readonly string[],
  heard: readonly HeardWord[],
  durationMs: number
): Alignment => {
  const reference = Arr.map(lineWords, normaliseWord);

  const pairs = matchPairs(
    reference,
    Arr.map(heard, (word) => normaliseWord(word.w))
  );

  const spans: WordSpan[] = [];

  for (const index of reference.keys()) {
    const word = heard[pairs.get(index) ?? -1];

    if (word !== undefined) {
      spreadGap(spans, reference, index, word.startMs);
      spans.push({ endMs: word.endMs, startMs: word.startMs });
    }
  }

  spreadGap(spans, reference, reference.length, durationMs);

  const total = lineWords.length + heard.length;

  return {
    match: total === 0 ? 1 : (2 * pairs.size) / total,
    words: enforceOrder(spans, durationMs),
  };
};
