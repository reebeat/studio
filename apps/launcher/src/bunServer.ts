import { BunHttpServer } from "@effect/platform-bun";

// The HTTP server on Bun, listening on the loopback address only and on a port the operating system chooses, so
// another machine cannot connect and two copies never collide. It also provides Bun's file system, path, terminal,
// stdio and child-process services.
export const serverLayer = BunHttpServer.layer({
  hostname: "127.0.0.1",
  port: 0,
});
