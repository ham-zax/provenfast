---
name: provenfast
description: Measurement-first performance loop for any app, repo, OS, or agent harness. By default makes the slowest common interaction meet a target with the least effort, then stops. Picks the right wall-clock, deterministic-count (instructions, calls, renders, DOM/style work, allocations, queries, requests) and frame-budget metrics, proves the proxy tracks wall clock, optimizes against it, guards behavior with equivalence tests and flags, and locks wins with a ratchet that can only go down. Use when the user says "make it faster", "speed up", "latency", "slow", "startup time", "jank", "frame drops", "perf regression", "benchmark", "profile", "ratchet", "wall clock", "instruction count", "call count", or wants a perf CI gate. Default is a lean pass: fix the slow interaction users hit most with existing tools, verify what it could break, and stop at the target. Gates, ratchets, and multi-thread sprints only on explicit request. Not for one-off micro-tuning without a user-visible journey.
---

# ProvenFast

> If it can be measured, it can be improved. Once a metric exists, an agent can
> iterate against it without waiting for field data.

Distilled from Anthropic's August 2026 claude.ai speed sprint
(<https://claude.dev/blog/how-we-made-claude-ai-faster/>). In that sprint, an
agent working in one shared channel made the core journeys 3.1x faster
(geometric mean across 13 metrics) in two weeks. Anthropic reports 3,000+
merged changes without a single customer-facing incident or rollback. That is
their claim, and a critic later found UX bugs it does not capture
(`references/field-lessons.md` B1). The useful part is not any single trick but
the **loop**, the **metric ladder**, and the **guardrails** below. They work for
any stack.

## Default: the most improvement for the least effort

This skill makes an app noticeably faster. It does not start a multi-day
performance program. Unless the user explicitly asks for deeper work, run the
**lean pass**:

1. **Start with the main pain.** Pick the slow interaction users hit most often and time it on a representative device and input. Use the user's target; if there is none, propose one from the current number and what users can perceive, and state it in the report.
2. **Measure lightly.** Before/after wall clock (median of at least 3 runs) and one targeted profile are usually enough.
3. **Fix the dominant cost with existing tools.** Typical wins: fewer duplicate fetches, narrower re-renders, smaller payloads, startup work deferred, better data loading (catalogue in section 4).
4. **Verify what the change could break.** Run the affected tests. When the change touches caching, fetching, or saving, check freshness and persistence (section 5). Scale verification to risk.
5. **Stop at the target** (section 7). Continue only while another improvement is both clear and cheap. Report what remains, with an estimated gain for each, and let the user decide.

**Deep mode** needs an explicit request: several journeys or parallel threads, custom benchmark rigs, deterministic gates and CI ratchets, frame stepping, runtime or architecture changes, staged rollouts, deploy monitoring. One exception: add a counter or ratchet in a lean pass when the same regression has already come back, or when the user asks for one.

The rest of this file serves both modes. Steps and sections marked *deep mode* are skipped in a lean pass.

## 0. Adapt before you measure

Do this once per task, only as far as the journey needs. It decides which tools and which section of the references apply.

1. **Harness.** Map the verbs in this skill to your tools (table below). If you cannot run commands, produce the exact commands and ask the user to run them and paste the output.
2. **System.** Run `scripts/doctor.sh [repo]` (Linux/macOS/WSL) or `scripts/doctor.ps1 [repo]` (Windows PowerShell). It reports OS, cores, load, the available tools, and an install command for each missing one.
3. **Missing tools.** **Ask the user before installing anything.** Give the exact command for their OS (`references/tools-by-os.md`). Never run `sudo` or elevated installs yourself; ask the user to run them (in Claude Code: `! sudo apt-get install -y valgrind`). If they decline, fall back to the next metric on the ladder and say what precision you lost.
4. **Repo conventions win.** Look for existing bench, profile, and trace tooling first (`bench`, `perf`, `profile`, `benchmark` scripts, tracing env flags, CI perf jobs) and reuse it. Repo instructions (AGENTS.md, CLAUDE.md, CONTRIBUTING) override this skill on run counts, memory caps, commit rules, and test commands.
5. **Stack.** Open the matching section of `references/stacks.md` (web/browser, Node, Python, Go, Rust, JVM, .NET, native, mobile, databases/backends, CI/builds, agent/LLM workflows).
6. **Drive the app.** Confirm you can script the journey and read its counters and traces (a CLI command, a bench script, or Playwright/CDP for a browser). How well an agent can drive the app limits deep performance work more than anything else. If you can't, set it up first (ask before installing).

| Verb in this skill | Claude Code | Codex / OpenCode / Gemini CLI / Aider | Cursor / Windsurf / IDE agents | Chat only (no shell) |
|---|---|---|---|---|
| run a command | Bash (cap memory per repo rules) | shell tool | terminal tool | give command, user pastes output |
| ask the user | AskUserQuestion, or ask in text | ask in chat | ask in chat | ask in chat |
| browser counters | browser skill / Playwright / CDP | Playwright via shell | built-in browser or Playwright | snippet from `references/browser.md` pasted in DevTools |
| parallel threads | subagents or workers, one journey each | separate sessions or worktrees | separate chats or branches | one journey at a time |
| long-running wait | background task plus notification | blocking wait | terminal | user reports back |

## 1. The loop

Run one loop per **journey**: a user-visible flow with a start and an end, such as "cold launch to typeable", "open conversation", "send to first token", "search request p50", "`index` on repo X", or "CI job wall time".

1. **Open the thread.** Name the journey, the user-visible endpoint, the current number, and an owner. Keep it narrow: one journey or benchmark per thread.
2. **Build the benchmark.** Trace the real flow end to end and reproduce it with fixed inputs. In a lean pass, a scripted repro and a timer are enough. In deep mode, build a lab harness at a typical size *and* a worst-case size taken from real shapes (the longest real conversation, the biggest repo). Toy fixtures hide superlinear work. Record a baseline (section 3).
3. **Find the dominant cost.** Profile; don't guess. Rank costs, and attack the biggest one the profile shows (section 4).
4. **Ship small changes, sized for risk.** Add tests or an equivalence check *before* optimizing. Guard user-perceptible changes in proportion to risk (section 5).
5. **Watch the deploy** (deep mode, or where field data already exists). Compare the lab metric and the field metric (RUM, logs, traces) before and after. Confirm the field moved, not just the lab.
6. **Lock it in** (deep mode, or when this regression has happened before). Lower the ratchet ceiling (`scripts/ratchet.mjs update`) so the win cannot silently regress. Run `update` on the main branch after merges or nightly; an unratcheted win is headroom for the next regression.
7. **Finish or continue.** In a lean pass, stop at the target (section 7). In deep mode, the first target is not the end: look for the next cost *within the same journey* and close the thread only at diminishing returns.

## 2. The metric ladder

Use three tiers. Each tier has a different job, so do not substitute one tier for another.

A lean pass needs only Truth and Explain: before/after wall clock and a profile. Add Gate metrics when the user asks for CI gates, when a regression has recurred, or when wall clock is too noisy to tell changes apart, in which case a count is the cheaper tool.

| Tier | Purpose | Examples | Property |
|---|---|---|---|
| **Truth** | What users feel; the number you report | wall clock per journey, p50/p95 latency, time-to-interactive, frames per second, peak RSS | noisy, hardware-dependent |
| **Gate** | CI ratchets, fast iteration, tiny diffs | instruction counts, function call counts, allocations/op, render commits, style recalcs, layouts, DOM mutations, DB queries, network requests, bytes | deterministic for fixed input; machine-independent or nearly so |
| **Explain** | Why a number moved | CPU profile, call tree, flame graph, per-function call counts, query log, frame-by-frame trace | diagnostic, not gated |

Rules:

- **Validate every gate proxy against truth** before trusting it. Make one real optimization and measure both the proxy and the wall clock. They must move in the same direction with a plausible ratio. In the sprint, cutting instructions by 48% cut wall clock by 78% on one hot path, and 31% fewer instructions gave 44% less wall clock on another. If the proxy moves and the wall clock does not, the proxy is measuring the wrong work. Pick another proxy. Validation covers one mechanism: re-check against wall clock whenever the kind of change, the workload, or the fixture changes, because a proxy can drop for work that was never on the slow path.
- **Measure the noise of the gate.** Run it twice on unchanged code. Deterministic counts should agree within 0.1%; instruction counts under Valgrind with `node --predictable` typically agree within 0.001%. Set the ratchet tolerance just above the observed noise.
- **Subtract fixed startup cost.** A process-level count includes runtime boot. For example, an empty `node` process costs about 96M instructions, which can hide a 40% workload win as a 3% total change. Either measure a no-op baseline and subtract it, or measure in-process around the journey.
- **Count calls to explain instructions.** `scripts/call-counts.mjs` showed a resolver called 59,999 times instead of 20,000: the "resolve each ID once, not three times" fix is visible directly.
- **Pair every gate with a counter-check.** A count rewards deleting work, including the work that keeps the app correct: revalidation, cache invalidation, persistence, retries, syncing. Before removing a request, write, or render, prove it is redundant (a named invariant already guarantees its result). Add a check that fails if it wasn't: freshness after a change made elsewhere, durability across a refresh mid-action, convergence to server truth. Fewer requests with stale data on screen is a regression, not a win.
- **Split at the ready mark, then prove the critical path.** Split each count at the journey's ready mark into *before ready* and *after ready*. Before-ready is only an upper bound on blocking work: analytics or a prefetch can start early without holding anything up. To prove an item is *blocking*, delay it on purpose and check whether the ready mark moves by about the delay (`references/browser.md`). Optimize blocking work first, usually by reordering: fetch what the first interaction needs first, then keep data fresh in the background. Background work still costs battery, data, and server load, but remove it only with the redundancy proof above.
- **Ratchet absolute counts per journey, never global ratios.** Coverage percentages and averages can block deleting dead code. Deleting code should only ever lower a count.
- **Count events, not scores.** A summed or averaged score can pass while users see a problem. Each sidebar shift in the sprint scored about 0.008 CLS, well inside the 0.1 "good" threshold, yet the page felt janky. Attribute raw entries (each layout shift, each long frame) to named regions, and fail on any where none is expected.
- **Several cheap counters beat one perfect one.** Each new instrument tends to expose new targets. In the sprint, about a third of the PRs added telemetry or a guardrail.

## 3. Measurement protocol

### Wall clock (truth)

- **Audit the window first.** Start at the user's action (the input event's timestamp or navigation start), not at component mount or request start. End when the user can use the result. Separate client time from server time. Check the instrumented number once against a screen recording: a dashboard that starts the clock late will "prove" a slow journey is fast.
- Use `hyperfine --warmup 3 --runs 10 '<cmd>'`, or the stack-native harness (pyperf, `go test -bench` plus benchstat, criterion, JMH, BenchmarkDotNet).
- Report **median of at least 3 runs** (more if the repo asks), the spread (IQR or min/max), and **peak memory** (`/usr/bin/time -v` on Linux, `/usr/bin/time -l` on macOS, `Measure-Command` plus process stats on Windows).
- Record machine load (`uptime` or `doctor.sh`), core count, power mode, and whether the cache was warm or cold. Compare before and after only on the same machine, input, and load.
- For cold-start journeys, state how you made the start cold: dropped OS caches, a fresh profile, or a cleared app cache.
- For percentiles, collect enough samples that at least 10 fall beyond the percentile: about 200 runs for p95 and 1,000 for p99. With 100 samples, p99 is just the slowest run or two. Report the distribution and a confidence interval (a bootstrap is fine), not one number.
- Always give absolute times next to percentages. "−78%" is very different at 60 ms and at 4 s.

### Deterministic counts (gate)

- **Instructions:** `scripts/instr-count.sh -- <cmd>`. It uses the Valgrind backend where available, then `perf stat` with a PMU, then macOS `time -l`. For Node, add `--predictable --random-seed=1`. Keep the workload small, because Valgrind is 20-80x slower.
- **Calls:** `node scripts/call-counts.mjs --filter <src-dir> --json calls.json -- node <entry>` for JS. For other stacks, see `references/stacks.md` (cProfile ncalls, Go pprof counts, callgrind call counts, JFR, EventPipe).
- **UI work:** render commits, style recalculations, layouts, DOM mutations, long animation frames, and layout shifts per interaction (`references/browser.md`).
- **I/O work:** queries per request, rows/buffers read, network requests and bytes per journey, file reads, cache misses, process spawns. These are often the biggest wins and the easiest gates.
- **Agent/LLM workflows:** tool calls, model round trips, input/output tokens, and cache-hit ratio per task.

Write every gate into a single flat `metrics.json` (`{"journey.metric": number}`) so `ratchet.mjs` can check it.

### Frame budget (smoothness)

For streaming, scrolling, and animation, use the frame budget: 16.67 ms per frame at 60 Hz and 8.33 ms at 120 Hz. Add an FPS readout computed from `requestAnimationFrame` timestamps. In CI, drive headless Chromium with deterministic frame stepping (CDP `HeadlessExperimental.beginFrame`) and step through the worst case frame by frame. Verify the rig first: N begin frames must produce exactly N frames (the sprint's 120 Hz rig produced 240 frames from 240 begin frames at 8.33 ms). Gate on **total main-thread blocking time** and **worst single frame**, not average FPS. In the sprint, stepping a long streamed reply frame by frame cut its main-thread blocking from over 750 ms to 200 ms and its CPU to a third, and it held 120 FPS. The method: remove work that grows with message length on each chunk, memoize finished blocks, and move growing-code-fence tokenization to a worker. The 120 Hz rig then became a nightly job.

## 4. Hunting: where the time actually goes

Run a **census** before you guess. Each census below found a large, invisible cost in the sprint:

- **Subscription/re-render census:** count components, hooks, store subscriptions, and listeners that wake on one keystroke or event. One composer had about 6,900 hooks and 900 subscriptions re-rendering per keystroke.
- **Selector/rule audit:** a single expensive CSS selector (`:root:has(...)`) added 24 ms to every DOM change. The same applies to regex tables, middleware chains, and validation rules.
- **Code path tracing:** a forgotten `location.reload()` caused about 500k hidden reloads a day. Grep for reloads, retries, polling, and duplicate fetches.
- **Idle profiling:** profile while the user does nothing. One idle tab cloned cache snapshots into IndexedDB twice a minute on the main thread.
- **Data-flow census:** count fetches, cache reads and writes, and renders per journey. Repeated work, such as the same ID resolved three times, often traces back to one data-loading pattern that also triggers extra renders.
- **Encoding and representation:** in V8, one character outside Latin-1 (an em dash or a curly quote, but not `é`, which fits) stores the whole string as two-byte UTF-16 and puts every regex over it on a slower path. Copying each code block into a fresh one-byte string before highlighting cut a 1.0 s freeze to 0.35 s. Apply this only when a profile shows regex or string work on such strings is hot.
- **Re-check against the budget after a micro-fix.** 0.35 s is still about 40 frames at 120 Hz. If the work is still over budget, ask whether it belongs on that thread at all. A worker or WASM module, lazy-loaded, takes it off the main thread entirely. Memoize its results per finished block on the calling side, so each new chunk does not re-run it over everything. Count the costs: bundle size, message passing, ordering, and cancellation.
- **Style, paint, and GPU:** CPU profiles miss these costs. Count style recalcs and layouts via CDP, and use the DevTools Rendering panel (paint flashing, layout-shift regions, layer borders).
- **Costs in a dependency.** When the profile points into a library, runtime, or browser, the fix may belong upstream; the sprint landed changes in Electron, Chromium, and Node. Ship a local workaround that links the upstream issue, and remove it once the fix is released.

### Pattern catalogue

Each fix below gives the same output with less work. Prove that with an equivalence test.

| Smell | Fix |
|---|---|
| Same lookup repeated per item | resolve once and pass it down; hoist out of loops |
| Plain objects used as dictionaries over many shapes (megamorphic lookups) | `Map`, or a stable shape; resolve once |
| Expensive regex/parse on every line | cheap first-character or length prefilter, then the full check |
| O(total length) work per streamed chunk | memoize finished blocks; only process the growing tail |
| Heavy work on the UI/main/request thread | move it to a worker, thread pool, or background job; memoize results per finished unit; keep a fallback |
| Big layout/paint in one frame | split it across frames (cell by cell, row by row) to fit the budget |
| Interactive UI waits for framework boot | ship a static shell rendered from the same component, then hydrate over it; test the handoff |
| Recompiling the same code every start | bytecode or code cache, snapshot, AOT, persistent compile cache |
| Navigation waits on fetch | prefetch on intent (hover, focus, viewport), with cancellation and a concurrency cap |
| Persistent UI remounts on navigation | keep it mounted across routes (composer, sidebar) |
| Page waits on the network for data it showed last time | render the cached copy immediately (provisional if needed), then revalidate and reconcile; never skip the revalidation |
| Constant per-session work repeated per request | cache it behind a witness (hash, stat signature, frozen value identity); fall back when unsure |
| N+1 queries or round trips | batch, join, or preload; gate on query count |
| Re-render storms | narrow subscriptions, stable props, selector memoization; gate on commit count |
| Late content moving the layout | reserve space, pin layout, gate on layout shifts per region; allow movement only where reconciliation changed the data |
| Regions shown together resolve at different times | load them from the same cache or request, or hold the group and reveal it together; measure when the *last* one is usable |

## 5. Guardrails: what makes bold changes safe

- **Tests come first.** Before any optimization, the behavior must be covered. If it is not, add the test, watch it pass on the old code, then optimize.
- **Equivalence, not just speed.** Changes that claim "same output, faster" need a differential test of new vs old over fixtures that hit every branch the new code takes. A fast path returns "unsure" and falls back unless it is provably correct. Mutation-check the test: break the cache key or witness, confirm the test fails, then restore it.
- **Hand-offs get their own tests.**
  - Generate the fast copy from the source of truth, never by hand. The sprint rendered the real component in JSDOM to produce the static markup.
  - Static-to-live UI swaps need layout comparisons across several viewport sizes (the sprint used 14 viewports with ±1 px tolerance), plus keystroke-ordering tests.
  - Worker offloads need ordering and cancellation tests.
  - Caches need invalidation tests.
  - In the field, report any movement at the seam and investigate anything non-zero.
- **Adversarial scenarios.** Users rarely report these failures, and speed metrics never show them. Test them on purpose for any change to caching, fetching, persistence, or navigation:
  - change or delete something in a second tab or device, then reload;
  - refresh or navigate away mid-action (right after send);
  - cold, warm, and stale caches;
  - slow and offline networks;
  - the worst-case fixture.
- **Make human testing one step.** Provide a preview URL per PR, or a PR label that builds the desktop artifact. If trying a change takes 20 minutes, nobody feels it before users do. When several fixes are plausible, build each as a demo the owner can try. The owner should use the change before rollout.
- **Auto-merge only what gates cover.** Visual, animation, and interaction changes need a human to look at a before/after recording, because no count covers them.
- **Guard perceptible changes in proportion to risk.** Use what the project already has: a feature flag, a config or env switch, a release channel, or for a CLI or small tool, a plain revert. Where flags and staged rollout exist, roll out to the team, then to a small share of users, then to everyone. Classify each flag as a *kill switch* or a *ramp*, give it an owner and a removal date, keep all flags in one list, and retire them. The sprint created about 200 and retired more than half before it ended.
- **Review.** Every change gets automated review plus at least one human approval when the project has humans in the loop. Show user-visible changes as before/after recordings. Reviewers read each change's stated mechanism and counter-checks, not just its numbers, and turn each doubt into a test the agent must pass (`references/field-lessons.md` D7).
- **Lab checks vs committed tests.** Generate as many throwaway checks as help you prove a change. Commit only the ones that guard a real invariant, within the repo's test budget.
- **Ratchet wins that must not regress** (deep mode, or when a regression has recurred).
  - `scripts/ratchet.mjs check` runs in CI or nightly.
  - Post the result where agents and reviewers read it: `--markdown "$GITHUB_STEP_SUMMARY"`, or a file posted as a PR comment. The coding agent and the review agent then catch regressions before a human has to.
  - `update` only ever lowers ceilings. Raising a ceiling must be a reviewed edit with a stated reason.
- **Headless isn't the user's machine.** Headless browsers lack real browser UI, prerendering, extensions, and GPUs. A page can be rendered at one viewport size and shown at another: Chrome prerendered claude.ai at the new-tab page's height, and the page grew 56 px after first paint. When field data disagrees with the lab, reproduce the field condition in the lab and add it as a test.

## 6. Deep mode: many narrow threads, not one wide one

Only when the user explicitly asks for a performance project: several journeys, a sprint, gates across the app, or the best result rather than a good one.

- Run one journey or benchmark per thread or worker, and scale by opening more threads. The sprint ran 150+ in parallel.
- Each thread has a named owner who supplies **taste**: which trade-offs are acceptable. The agent's job is to measure each option's cost (for example, a word-by-word fade's share of the frame budget) and build two or three variants. The owner chooses. Use data where it exists: pick a skeleton delay from the measured load-time distribution so the skeleton never flashes for a frame or two. Holding content back until it is complete makes rendering cheaper but delays the first thing users see, so that is a taste call, not a rule.
- A coordinator supplies **direction**: sequencing, deduplication, merging threads that step on each other, and closing threads at diminishing returns.
- Supply **ambition**: agents default to small scope. Push for boldness only once the guardrails in section 5 are in place; the sprint asked for it because it trusted them.
  - Treat targets as starting points in deep mode: "the targets are not the stopping point; what's next?"
  - When wins plateau, propose three options, from incremental to radical (a cache layer, a worker or process boundary, a new data model, a different runtime). Give each an estimated time saved, its complexity, and the benchmark that would prove it. Implement the one the owner picks.
  - A standing instruction beats repeated nudges, for example in `AGENTS.md` or `CLAUDE.md`: "If I state the outcome, keep going and hill climb until you get there." Repo rules on scope and approval still win.
- **Estimate impact in milliseconds, not effort in days.** Agents estimate effort in human working days and overshoot badly. Within the authorized scope, do the work now instead of scheduling it.
- Where possible, run agent-driven browsers and wall-clock benchmarks on a separate machine, VM, or container, so the user's activity stays out of the numbers and the agent stays off their screen.
- On a single machine, keep heavy measurements serial. Parallel benchmarks corrupt each other's wall clock. Deterministic counts are safer to parallelize.

## 7. When to stop

Rank work by **absolute time saved × how often the journey runs** (user-hours), not by percentage.

Stop when any of these is true:

- **Lean pass (default):** the journey meets the target, and no further improvement is both clear (the profile shows it) and cheap (a small change with existing tools);
- the next win is below the measurement noise or below what users can perceive;
- the complexity cost is greater than the gain. In one sprint decision, saving 2 ms per send did not justify maintaining a 900-line custom build plugin. New infrastructure needs a perceptible win.

When you stop, report what remains with an estimated gain for each, and let the user decide. In deep mode, open the remaining journeys as new threads (p95 tails, very large inputs, rarely-run flows) instead of stretching the current one.

## 8. Report format

Lead with the result, and put the command log at the end.

```
Journey: <name> (<platform>, <input/fixture>, cold|warm)
Truth:   <before median> -> <after median>  (<x>x, n=<runs>, spread <IQR>, peak RSS <a> -> <b>)
Impact:  <ms saved> x <journey frequency> ; before/after-ready split and proven blocking items if relevant
Gates:   instructions <a> -> <b> (<-%>), calls <a> -> <b>, <other counts>
Proxy validated: <yes: proxy -% vs wall -%> | <no: why>
Cause:   <dominant cost from profile, file:line>
Change:  <what changed>; flag <name> | none
Safety:  <equivalence/differential test>, <mutation check result>
Counter: <freshness / durability / scenario checks that prove nothing necessary was removed>
Ratchet: <baseline file> lowered: <metric> <old> -> <new>
Command: <exact commands used> ; machine <cores, load>
```

When summarizing several journeys, use the geometric mean of the speedups, not the arithmetic mean.

## Files

- `scripts/doctor.sh`, `scripts/doctor.ps1`: detect OS, stack, and tools, and print install commands. They never install.
- `scripts/instr-count.sh`: instruction counts (valgrind | perf | macOS backends).
- `scripts/call-counts.mjs`: deterministic JS function call counts via V8 precise coverage.
- `scripts/ratchet.mjs`: `check` / `update` ceilings that only go down; `--markdown FILE` for CI summaries and PR comments.
- `references/tools-by-os.md`: tool matrix and install commands for Linux, macOS, Windows, and WSL.
- `references/stacks.md`: recipes per stack and workflow (truth, gate, and explain tools for each).
- `references/browser.md`: in-page counters (commits, style recalcs, DOM mutations, layout shifts, requests before and after ready, a delay test for blocking requests, frame meter), cache and freshness tests, and CDP frame stepping.
- `references/field-lessons.md`: each claim in the sprint write-up, the main public critique of it, and a verdict on what holds up. Read it before any web or desktop UI work, or when a gate is about to delete work.
