// Which concurrent write to the same field wins? Peer A (id 2 or 3) makes `extra` unrelated edits first, then sets the field; B just sets it.
import { libs, sync } from "./doc.ts";
import { keyed } from "./model.ts";
import { baseIr } from "./ir.ts";

for (const lib of libs) {
  const rows: string[] = [];
  for (const extra of [0, 3]) for (const [aId, bId] of [[2, 3], [3, 2]] as const) {
    const o = keyed.open(lib, 1, baseIr());
    const a = o.fork(aId); const b = o.fork(bId);
    for (let i = 0; i < extra; i += 1) keyed.setElementProp(a, "sc4", "hint", "text", `noise${i}`);
    keyed.setElementProp(a, "sc4", "one", "cell", "tl");
    keyed.setElementProp(b, "sc4", "one", "cell", "br");
    sync(a.doc, b.doc);
    const v = keyed.view(a.json()).scenes[3].elements.find((e: any) => e.id === "one").cell;
    rows.push(`A(id ${aId}, ${extra} prior edits)=tl vs B(id ${bId})=br -> ${v === "tl" ? "A" : "B"} wins`);
  }
  console.log(lib.padEnd(9), rows.join(" | "));
}
