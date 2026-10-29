// The registry facts of spec 0002 section 1 (licence, versions, stars, dates), read live. The values change with time:
// the committed output is the 2026-10-29 reading. Needs `npm` and an authenticated `gh`. Output: `output/facts.txt`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd: string, args: string[]): string => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch (e) {
    return `failed: ${String(e).split("\n")[0]}`;
  }
};

for (const pkg of ["yjs", "@automerge/automerge", "@automerge/automerge-repo", "loro-crdt", "y-partyserver", "partyserver", "loro-websocket"]) {
  console.log(`== npm view ${pkg}`);
  console.log(run("npm", ["view", pkg, "version", "license", "dist.unpackedSize", "time.modified"]));
}
for (const repo of ["yjs/yjs", "automerge/automerge", "automerge/automerge-repo", "loro-dev/loro", "loro-dev/protocol", "cloudflare/partykit", "napolab/y-durableobjects"]) {
  console.log(`== gh api repos/${repo} (full_name, license, stars, created, pushed)`);
  console.log(run("gh", ["api", `repos/${repo}`, "--jq", "[.full_name,.license.spdx_id,.stargazers_count,.created_at[:10],.pushed_at[:10]]|@tsv"]));
}
for (const repo of ["yjs/yjs", "automerge/automerge", "loro-dev/loro", "automerge/automerge-repo"]) {
  console.log(`== latest releases of ${repo}`);
  console.log(run("gh", ["api", `repos/${repo}/releases`, "--jq", ".[0:3][]|[.tag_name,.published_at[:10]]|@tsv"]));
}
for (const pkg of ["yjs", "@automerge/automerge", "loro-crdt"]) {
  const first = readFileSync(`node_modules/${pkg}/LICENSE`, "utf8").split("\n").slice(0, 3).join(" | ");
  console.log(`== node_modules/${pkg}/LICENSE, first lines: ${first}`);
}
