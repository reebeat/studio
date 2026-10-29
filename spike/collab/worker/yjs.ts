import * as Y from "yjs";
import { makeRoom, route } from "./room.ts";

export const Room = makeRoom(async () => {
  const doc = new Y.Doc();
  return { apply: (b) => Y.applyUpdate(doc, b), snapshot: () => Y.encodeStateAsUpdate(doc) };
});
export default { fetch: (request: Request, env: { ROOM: DurableObjectNamespace }) => route(env, request) };
