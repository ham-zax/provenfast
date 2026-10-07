# ProvenFast

**If it can be measured, it can be made faster.**

ProvenFast is an agent skill that makes your app, service, CLI, build, or agent
workflow faster, and proves it. It turns "make it faster" into a loop:

1. Briefly triage the main interactions and measure the largest worthwhile bottleneck.
2. Find the dominant cost.
3. Make worthwhile changes and check what they could break.
4. Verify the gain and finish when the target is met.

A new regression gate is added only when a regression has already recurred or
you ask for one.

It works in Claude Code, Codex, OpenCode, Gemini CLI, Cursor, or a plain chat,
on Linux, macOS, Windows, and WSL.

It is built on the method behind Anthropic's
[claude.ai speed sprint](https://claude.dev/blog/how-we-made-claude-ai-faster/)
(3.1x faster core journeys in two weeks; 3,000+ changes and, by Anthropic's account, no customer-facing incident or rollback). ProvenFast
generalizes that method to any stack.

## Why it works

Wall clock is what users feel. A lean pass starts with before/after timings and
a targeted trace or profile. When timing noise makes experiments hard to compare,
a validated counter can be cheaper and more reliable. ProvenFast offers three tiers:

| Tier | Job | Examples |
|---|---|---|
| **Truth** | what you report | wall clock, p50/p95, time to interactive, FPS, peak memory |
| **Gate** | what you iterate and ratchet on | instruction counts, call counts, renders, style recalcs, DOM mutations, allocations, queries, requests, tokens |
| **Explain** | why a number moved | CPU profiles, call trees, query logs, frame-by-frame traces |

Stable counters can make experiments faster and catch small regressions in CI.
Each proxy is **validated** against wall clock and rechecked when the workload or
optimization mechanism changes. Using a counter does not require building CI
tooling.

Counts can be gamed. The cheapest way to lower a request or render count is to
delete the work that keeps the app correct: revalidation, cache invalidation,
persistence. So ProvenFast pairs every gate with a **counter-check**, such as
freshness across tabs, durability across a refresh, or convergence to server
truth. It also splits counts at the moment the screen is ready and uses traces
or targeted experiments to identify which early work actually blocks the user.

In the [worked example](docs/worked-example.md), the same change measured on the
same machine gave:

- instruction count: **−12.9%**, identical to 0.0002% across runs, even under heavy load;
- function calls: **−58.8%**, which points straight at the cause;
- wall clock: **1.28x faster** on a quiet machine, and a meaningless "3x slower" when other jobs were running.

## Install

With the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add ham-zax/provenfast -g                 # pick agents interactively
npx skills add ham-zax/provenfast -g -a claude-code  # or name one
```

Or clone it and link the skill into each harness's skills folder:

```bash
git clone https://github.com/ham-zax/provenfast ~/repo/provenfast
ln -s ~/repo/provenfast/skills/provenfast ~/.agents/skills/provenfast            # shared agents folder
ln -s ~/repo/provenfast/skills/provenfast ~/.claude/skills/provenfast            # Claude Code
ln -s ~/repo/provenfast/skills/provenfast ~/.codex/skills/provenfast             # Codex
ln -s ~/repo/provenfast/skills/provenfast ~/.config/opencode/skills/provenfast   # OpenCode
```

For a harness without skill support, paste `skills/provenfast/SKILL.md` into the
agent's instructions.

## Use

Ask your agent something like:

- "Make opening a conversation faster. Use provenfast."
- "Our CLI's cold start is slow. Find out why and ratchet it."
- "Add a perf gate to CI for the search endpoint."
- "Streaming replies drop frames on 120 Hz screens."

By default the agent does a **lean pass**: the most improvement for the least
effort and maintenance.

1. It starts with the interaction you named, or briefly triages startup, navigation, and the main interaction before choosing the largest worthwhile bottleneck.
2. It measures and profiles that interaction, then fixes the dominant cost. A bounded larger change can be worthwhile when it removes the main problem.
3. It checks what the change could break: tests, and freshness and persistence when caching or saving is involved.
4. It reports measured before/after performance and finishes when your target is met, or, if you gave none, the provisional target it states up front. It reports significant remaining issues already observed, with uncertainty.

Existing tools and inexpensive counters support a lean pass. Extended sprints, specialized benchmark rigs,
runtime replacements, and ongoing monitoring are **deep mode** and need an
explicit request. Asking for one gate authorizes that gate, not a full sprint.

In deep mode, agents tend to settle for small wins and to quote effort in human
working days. These prompts help:

- "Before changing anything, find a way to measure this and prove the measurement tracks what users feel."
- "The targets are not the stopping point. What's next?"
- "Give me three proposals, from incremental to radical, each with estimated ms saved, complexity, and the benchmark that proves it."
- "Estimate impact in milliseconds, not effort in days."
- "Build two variants so I can pick."

## What's inside

```
skills/provenfast/
├── SKILL.md                 the loop, metric ladder, guardrails, hunting playbook, report format
├── references/
│   ├── tools-by-os.md       Linux / macOS / Windows / WSL tool matrix and install commands
│   ├── stacks.md            web, Electron, Node, Python, Go, Rust/C++, JVM, .NET, mobile, DBs, CI, agent workflows
│   ├── browser.md           in-page counters, requests before/after ready, blocking-delay test, cache freshness tests, frame stepping
│   └── field-lessons.md     every claim in the sprint write-up, its critics, and a verdict on what holds up
└── scripts/
    ├── doctor.sh / .ps1     detect OS, stack, tools; print install commands (never installs)
    ├── instr-count.sh       instruction counts: valgrind | perf | macOS backends
    ├── call-counts.mjs      exact JS function call counts via V8 precise coverage
    └── ratchet.mjs          check / update ceilings that only go down; --markdown for CI and PR summaries
```

Optional bundled tools require `bash` for the shell scripts and Node 18+ for the
`.mjs` scripts. Start with the project's existing tools; `doctor.sh` lists
additional options such as `hyperfine` and Linux/WSL `valgrind` when needed.

## Try it in 30 seconds

```bash
cd ~/repo/provenfast
skills/provenfast/scripts/doctor.sh .
skills/provenfast/scripts/instr-count.sh -- node --predictable examples/resolve-once.mjs slow
skills/provenfast/scripts/instr-count.sh -- node --predictable examples/resolve-once.mjs fast
```

## Credits

The method is distilled from Anthropic's write-up,
[How we made claude.ai faster](https://claude.dev/blog/how-we-made-claude-ai-faster/#an-8-millisecond-budget).
[Theo Browne's video review](https://www.youtube.com/watch?v=FsDUOUV9Vs8&t=3289s) of that write-up shaped the counter-checks,
the split of work before and after ready, and the freshness tests. A transcript of the
video is in [`artifacts/theo's_rant.md`](artifacts/theo's_rant.md). ProvenFast
tests his claims instead of taking them on trust:
`skills/provenfast/references/field-lessons.md` records which ones it adopts,
limits, or rejects, and why.
ProvenFast is an independent project and is not affiliated with Anthropic.
