// A sync room as a Durable Object: WebSocket hibernation, an update log in the object's SQLite storage, compaction to a
// snapshot, the document held in memory only while the object is awake. Library specifics are behind `Backend`.
import { DurableObject } from "cloudflare:workers";

export interface Backend {
  /** Applies a client update (or a stored one). */
  apply(bytes: Uint8Array): void;
  /** The whole document as one update. */
  snapshot(): Uint8Array;
}

const compactAfter = 50;

export const makeRoom = (open: () => Promise<Backend>) =>
  class Room extends DurableObject {
    backend!: Backend;
    constructor(ctx: DurableObjectState, env: unknown) {
      super(ctx, env);
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, blob BLOB NOT NULL)");
      void ctx.blockConcurrencyWhile(async () => {
        this.backend = await open();
        for (const row of ctx.storage.sql.exec("SELECT blob FROM log ORDER BY id")) this.backend.apply(new Uint8Array(row.blob as ArrayBuffer));
      });
    }
    override async fetch(request: Request): Promise<Response> {
      if (request.headers.get("Upgrade") !== "websocket") {
        const rows = this.ctx.storage.sql.exec("SELECT count(*) AS n, coalesce(sum(length(blob)), 0) AS bytes FROM log").one();
        return Response.json({ log: rows, sockets: this.ctx.getWebSockets().length });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(this.backend.snapshot());
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
      if (typeof message === "string") return;
      const bytes = new Uint8Array(message);
      this.backend.apply(bytes);
      this.ctx.storage.sql.exec("INSERT INTO log (blob) VALUES (?)", bytes);
      for (const peer of this.ctx.getWebSockets()) if (peer !== ws) peer.send(bytes);
      const n = this.ctx.storage.sql.exec("SELECT count(*) AS n FROM log").one().n as number;
      if (n > compactAfter) {
        const snap = this.backend.snapshot();
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM log");
          this.ctx.storage.sql.exec("INSERT INTO log (blob) VALUES (?)", snap);
        });
      }
    }
    override webSocketClose(ws: WebSocket, code: number): void {
      ws.close(code);
    }
  };

export const route = (env: { ROOM: DurableObjectNamespace }, request: Request): Promise<Response> => {
  const name = new URL(request.url).pathname;
  return env.ROOM.get(env.ROOM.idFromName(name)).fetch(request);
};
