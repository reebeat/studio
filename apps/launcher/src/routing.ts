import { Array as Arr, Option, Result, String as Str } from "effect";

// The one place a request path becomes a file name. The server serves a fixed table of files, so the only thing that can
// go wrong is a path that tries to name something else: every such path is refused here, before any lookup.
export const assetKeyOf = (pathname: string): Option.Option<string> =>
  Result.try({
    catch: () => pathname,
    try: () => decodeURIComponent(pathname),
  }).pipe(
    Result.match({
      onFailure: () => Option.none(),
      onSuccess: (decoded) => {
        if (decoded === "/") {
          return Option.some("index.html");
        }

        const segments = Str.split(Str.slice(1)(decoded), "/");

        const escapes =
          !Str.startsWith("/")(decoded) ||
          Str.includes("\0")(decoded) ||
          Str.includes("\\")(decoded) ||
          Arr.some(segments, (segment) =>
            Arr.contains([".", "..", ""], segment)
          );

        return escapes ? Option.none() : Option.some(Arr.join(segments, "/"));
      },
    })
  );

// A file under `assets/` has a content hash in its name (Vite), so it never changes; the page that names it does.
export const cacheControlOf = (key: string): string =>
  Str.startsWith("assets/")(key)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
