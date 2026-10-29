import init, { LoroDoc } from "loro-crdt/web";
import wasm from "loro-crdt/web/loro_wasm_bg.wasm";
import { makeRoom, route } from "./room.ts";

export const Room = makeRoom(async () => {
  await init({ module_or_path: wasm as unknown as WebAssembly.Module });
  const doc = new LoroDoc();
  return { apply: (b) => void doc.import(b), snapshot: () => doc.export({ mode: "snapshot" }) };
});
export default { fetch: (request: Request, env: { ROOM: DurableObjectNamespace }) => route(env, request) };
