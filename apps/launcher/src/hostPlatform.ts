import { Context, Layer } from "effect";

// The operating system the program runs on (the names `process.platform` has: `linux`, `darwin`, `win32`, ...).
// Foreign ABI: Bun and Node expose it only as the ambient `process.platform`, and the installed Effect 4.1.0 has no
// platform service (its own `UserDirectories` reads the same global). This is the one place that reads it, and the
// suppression below is registered as EX-0001 in tools/quality/effect-exceptions.json with its retirement trigger.
export class HostPlatform extends Context.Service<
  HostPlatform,
  { readonly name: string }
>()("reebeat-studio/launcher/HostPlatform") {
  static readonly layer = Layer.sync(HostPlatform, () =>
    HostPlatform.of({
      // oxlint-disable-next-line effect/no-cross-runtime, effect/no-ambient-authority -- EX-0001: the only way to learn the host OS
      name: process.platform,
    })
  );
}
