# Worked example: resolve once, not three times

This reproduces one of the fixes behind Anthropic's claude.ai speed sprint (a
message tree resolved each ID three times instead of once). It walks through the
ProvenFast loop end to end on a 30-line file, `examples/resolve-once.mjs`.

```js
// slow
if (resolve(id) && resolve(id).parent) total += resolve(id).parent.length;
// fast
const message = resolve(id);
if (message && message.parent) total += message.parent.length;
```

All numbers below come from one 16-thread WSL2 machine (Node 24, Valgrind 3.26)
on 2026-10-07.

## 1. Equivalence first

Both modes must print the same checksum before any timing counts:

```bash
node examples/resolve-once.mjs slow 20000 5   # 544420
node examples/resolve-once.mjs fast 20000 5   # 544420
```

## 2. Gate metric: instructions

```bash
S=skills/provenfast/scripts
$S/instr-count.sh -- node --predictable --random-seed=1 -e 0                                  # startup baseline
$S/instr-count.sh -- node --predictable --random-seed=1 examples/resolve-once.mjs slow 20000 5
$S/instr-count.sh -- node --predictable --random-seed=1 examples/resolve-once.mjs fast 20000 5
```

| Run | Run 1 | Run 2 | Minus startup |
|---|---|---|---|
| `node -e 0` | 96,446,484 | 96,446,431 | — |
| slow | 324,020,108 | 324,020,717 | 227.6M |
| fast | 294,714,489 | 294,714,537 | 198.3M |

- Run-to-run spread: at most 609 instructions (0.0002%). A ratchet tolerance of 0.5% is generous.
- Workload change: **−12.9%**. Without subtracting startup, it would read −9.0%, because Node boot alone costs about 96M instructions. Always subtract it.

## 3. Explain metric: call counts

```bash
node $S/call-counts.mjs --filter resolve-once -- node examples/resolve-once.mjs slow 20000 5
node $S/call-counts.mjs --filter resolve-once -- node examples/resolve-once.mjs fast 20000 5
```

| | total calls | `resolve` calls |
|---|---|---|
| slow | 339,995 | 299,995 |
| fast | 140,000 | 100,000 |

The cause is visible without a profiler: three lookups per item became one.
Repeated runs give byte-identical output.

## 4. Truth metric: wall clock, and why it isn't the gate

```bash
hyperfine --warmup 2 --runs 10 -N \
  'node examples/resolve-once.mjs slow 100000 200' \
  'node examples/resolve-once.mjs fast 100000 200'
```

| Machine load (1-min avg) | slow | fast | Verdict |
|---|---|---|---|
| 1.2 | 1.539 s ± 0.070 | 1.204 s ± 0.149 | fast is **1.28x** faster: direction confirms the proxy |
| 12.0 (other agents running) | median 1.70 s | median 5.02 s | nonsense: "fast" looks 3x *slower* |

The second run was not a regression. Other jobs on the same machine were
competing for the CPU. Instruction counts taken in that same window were
unchanged to 0.0002%. That is why ProvenFast gates CI on deterministic counts
and uses wall clock to *validate* a proxy and to *report* results, never as the
gate.

## 5. Proxy validation

| Metric | Change |
|---|---|
| instructions (workload) | −12.9% |
| calls | −58.8% |
| wall clock (quiet machine, mean) | −21.8% |

The instruction count moved in the same direction as wall clock with a plausible
ratio, so it is a valid gate for this path. If it had dropped while wall clock
stayed flat, the proxy would be measuring the wrong work. That happened in an
earlier version of this example, where building a 2M-entry map dominated the
run and the lookup savings disappeared into the noise.

## 6. Lock it in

```bash
echo '{"resolve.instructions": 198268058, "resolve.calls": 140000}' > metrics.json
node $S/ratchet.mjs update perf-baseline.json metrics.json   # creates or lowers ceilings
node $S/ratchet.mjs check  perf-baseline.json metrics.json   # in CI: fails on regressions
```

`update` only ever lowers a ceiling. Accepting a regression requires a reviewed
edit to `perf-baseline.json`.
