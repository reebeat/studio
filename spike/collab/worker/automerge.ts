import * as A from "@automerge/automerge";
import { makeRoom, route } from "./room.ts";

export const Room = makeRoom(async () => {
  let doc = A.init<Record<string, unknown>>();
  return { apply: (b) => (doc = A.loadIncremental(doc, b)), snapshot: () => A.save(doc) };
});
export default { fetch: (request: Request, env: { ROOM: DurableObjectNamespace }) => route(env, request) };
