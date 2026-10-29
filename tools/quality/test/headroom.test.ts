import { NodeServices } from "@effect/platform-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Array as Arr,
  Config,
  Effect,
  FileSystem,
  Path,
  Result,
  Schema,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

// Spec 0003, Revisions 2026-10-29: `headroom.sh` reads the kernel files from PROC_ROOT, so each gate has a control with an
// injected sample. A stub `sleep` first on PATH grows `pswpin` by STUB_SWAPIN_DELTA, which is the sample window.
const stubSleep = `#!/usr/bin/env bash
current=$(awk '/^pswpin /{print $2}' "$PROC_ROOT/vmstat")
printf 'pswpin %d\\n' $((current + STUB_SWAPIN_DELTA)) >"$PROC_ROOT/vmstat"
`;

interface Sample {
  readonly memAvailMiB: number;
  // Pages swapped in during the 10 s sample window.
  readonly swapinPages: number;
  readonly psiFullAvg10: number;
  readonly psiFullAvg60: number;
  readonly load1: number;
  readonly nproc: number;
}

// 10 GiB of RAM, a 1 GiB expected demand: the memory gate needs MemAvailable of at least 3072 MiB.
const healthy: Sample = {
  load1: 2,
  memAvailMiB: 8192,
  nproc: 8,
  psiFullAvg10: 0.5,
  psiFullAvg60: 0.5,
  swapinPages: 100,
};

const memTotalMiB = 10_240;

const gates = (stdout: string) => ({
  exitCode: Number(/exit=(?<code>\d+)/u.exec(stdout)?.groups?.code),
  short: Arr.filterMap(Str.split(stdout, "\n"), (line) => {
    const gate = /^SHORT (?<gate>[^:]+):/u.exec(line)?.groups?.gate;

    return gate === undefined ? Result.failVoid : Result.succeed(gate);
  }),
});

const run = (sample: Sample) =>
  Effect.gen(function* runHeadroom() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const dir = yield* fs.makeTempDirectoryScoped();
    const root = yield* path.fromFileUrl(new URL("../../../", import.meta.url));

    const script = path.join(
      root,
      ".agents/skills/verify-studio/scripts/headroom.sh"
    );

    const proc = path.join(dir, "proc");

    yield* fs.makeDirectory(path.join(proc, "pressure"), { recursive: true });
    yield* fs.makeDirectory(path.join(dir, "bin"));
    yield* fs.writeFileString(path.join(dir, "bin", "sleep"), stubSleep, {
      mode: 0o755,
    });
    yield* fs.writeFileString(
      path.join(proc, "meminfo"),
      `MemTotal: ${memTotalMiB * 1024} kB\nMemAvailable: ${sample.memAvailMiB * 1024} kB\n`
    );
    yield* fs.writeFileString(path.join(proc, "vmstat"), "pswpin 1000\n");
    yield* fs.writeFileString(
      path.join(proc, "loadavg"),
      `${sample.load1} 1.00 1.00 1/100 1\n`
    );
    yield* fs.writeFileString(
      path.join(proc, "pressure", "memory"),
      `some avg10=50.00 avg60=50.00 avg300=50.00 total=1\nfull avg10=${sample.psiFullAvg10} avg60=${sample.psiFullAvg60} avg300=0.00 total=1\n`
    );

    const systemPath = yield* Config.schema(Schema.String, "PATH");

    const stdout = yield* spawner.string(
      ChildProcess.make("bash", ["-c", '"$0"; echo "exit=$?"', script], {
        cwd: root,
        env: {
          DEMAND_DISK_MIB: "1",
          DEMAND_MEM_MIB: "1024",
          HEADROOM_NPROC: String(sample.nproc),
          PATH: `${path.join(dir, "bin")}:${systemPath}`,
          PROC_ROOT: proc,
          SAMPLE_SECONDS: "10",
          STUB_SWAPIN_DELTA: String(sample.swapinPages),
          VERIFY_EVIDENCE_ROOT: path.join(dir, "evidence"),
        },
        extendEnv: true,
      })
    );

    return gates(stdout);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

describe("headroom.sh gates (injected /proc samples)", () => {
  it.effect("passes a healthy machine", () =>
    Effect.gen(function* passes() {
      assert.deepStrictEqual(yield* run(healthy), { exitCode: 0, short: [] });
    })
  );

  it.effect(
    "memory: MemAvailable after the demand under 20% of RAM is short; exactly 20% passes",
    () =>
      Effect.gen(function* memory() {
        assert.deepStrictEqual(yield* run({ ...healthy, memAvailMiB: 3071 }), {
          exitCode: 1,
          short: ["memory"],
        });
        assert.deepStrictEqual(yield* run({ ...healthy, memAvailMiB: 3072 }), {
          exitCode: 0,
          short: [],
        });
      })
  );

  it.effect(
    "swap-in: 1000 pages per second or more is short, just under passes",
    () =>
      Effect.gen(function* swapin() {
        assert.deepStrictEqual(
          yield* run({ ...healthy, swapinPages: 10_000 }),
          { exitCode: 1, short: ["swap-in"] }
        );
        assert.deepStrictEqual(yield* run({ ...healthy, swapinPages: 9990 }), {
          exitCode: 0,
          short: [],
        });
      })
  );

  it.effect(
    "memory PSI: full avg60 of 10% or more is short; avg10 and `some` are not gated",
    () =>
      Effect.gen(function* psi() {
        assert.deepStrictEqual(yield* run({ ...healthy, psiFullAvg60: 10 }), {
          exitCode: 1,
          short: ["memory PSI"],
        });
        assert.deepStrictEqual(
          yield* run({ ...healthy, psiFullAvg10: 80, psiFullAvg60: 9.99 }),
          {
            exitCode: 0,
            short: [],
          }
        );
      })
  );

  it.effect(
    "load: a 1-minute load average at the number of threads or more is short",
    () =>
      Effect.gen(function* load() {
        assert.deepStrictEqual(yield* run({ ...healthy, load1: 8 }), {
          exitCode: 1,
          short: ["load"],
        });
        assert.deepStrictEqual(yield* run({ ...healthy, load1: 7.99 }), {
          exitCode: 0,
          short: [],
        });
      })
  );

  it.effect("reports every gate that is short, not only the first", () =>
    Effect.gen(function* several() {
      assert.deepStrictEqual(
        yield* run({ ...healthy, load1: 9, psiFullAvg60: 30 }),
        {
          exitCode: 1,
          short: ["memory PSI", "load"],
        }
      );
    })
  );
});
