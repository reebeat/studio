// The case matrix and the strategy counts of spec 0002, in one place. `✓` valid IR, `✗` invalid, in the order
// Yjs, Automerge, Loro. Output: `output/summary.txt`.
import { cases, runAll } from "./cases.ts";
import { runStrategies } from "./strategies.ts";

const outcomes = runAll();
const cell = (model: string, id: string): string => {
  const runs = outcomes.filter((o) => o.case === id && o.model === model);
  const marks = runs.map((r) => (r.valid ? "✓" : "✗")).join("");
  return `${marks} ${[...new Set(runs.map((r) => r.shown))].join(" / ")}`;
};
for (const c of cases)
  console.log(`${c.id} | naive ${cell("naive", c.id)} | keyed ${cell("keyed", c.id)} | converged ${outcomes.filter((o) => o.case === c.id).every((o) => o.converged)}`);
const valid = (model: string): number => outcomes.filter((o) => o.model === model && o.valid).length;
console.log(`runs ${outcomes.length}, converged ${outcomes.filter((o) => o.converged).length}, valid ${outcomes.filter((o) => o.valid).length} (naive ${valid("naive")} of 57, keyed ${valid("keyed")} of 57)`);

const rows = runStrategies();
for (const model of ["naive", "keyed"]) {
  const mine = rows.filter((r) => r.model === model);
  const invalid = mine.filter((r) => !r.asMerged);
  const stuck = [...new Set(invalid.filter((r) => !r.repaired).map((r) => `${r.case}/${r.lib}`))].join(",");
  const refused = invalid.filter((r) => r.rejectAFirst !== null || r.rejectBFirst !== null).length;
  const falseRefusals = mine.filter((r) => r.asMerged && (r.rejectAFirst !== null || r.rejectBFirst !== null)).length;
  console.log(
    `${model}: runs ${mine.length}, invalid as merged ${invalid.length}, valid after repair ${invalid.filter((r) => r.repaired).length}, still invalid after repair: ${stuck}; gate refused an edit in ${refused} of ${invalid.length} invalid, false refusals ${falseRefusals}`
  );
}
