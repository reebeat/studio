import * as Y from "yjs";
const d = new Y.Doc();
d.getMap("ir").set("a", 1);
console.log(d.getMap("ir").toJSON());
