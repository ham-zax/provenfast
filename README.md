# ProvenFast

**If it can be measured, it can be made faster.**

ProvenFast is an agent skill that makes your app, service, CLI, build, or agent
workflow faster, and proves it. It turns "make it faster" into a loop:

1. Measure the journey.
2. Find the dominant cost.
3. Ship small changes with equivalence checks.
4. Lock each win behind a ratchet that can only go down.

It works in Claude Code, Codex, OpenCode, Gemini CLI, Cursor, or a plain chat,
on Linux, macOS, Windows, and WSL.

It is built on the method behind Anthropic's
[claude.ai speed sprint](https://claude.dev/blog/how-we-made-claude-ai-faster/)
(3.1x faster core journeys in two weeks, 3,000+ changes, zero rollbacks). ProvenFast
generalizes that method to any stack.

## Why it works

Wall clock is what users feel, but it is too noisy to iterate against or to gate
CI on. ProvenFast splits metrics into three tiers:

| Tier | Job | Examples |
|---|---|---|
| **Truth** | what you report | wall clock, p50/p95, time to interactive, FPS, peak memory |
| **Gate** | what you iterate and ratchet on | instruction counts, call counts, renders, style recalcs, DOM mutations, allocations, queries, requests, tokens |
| **Explain** | why a number moved | CPU profiles, call trees, query logs, frame-by-frame traces |

Gate metrics are deterministic for a fixed input, so an agent can try many
changes quickly, and CI can catch a 1% regression that wall clock would never
show. Each gate is first **validated** against wall clock so you never optimize
a number users can't feel.

Counts can be gamed. The cheapest way to lower a request or render count is to
delete the work that keeps the app correct: revalidation, cache invalidation,
persistence. So ProvenFast pairs every gate with a **counter-check**, such as
freshness across tabs, durability across a refresh, or convergence to server
truth. It also splits counts into the work that blocks the user and the work
that can run in the background.

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

The agent then:

1. detects your harness, OS, and stack, and asks before installing any missing tool;
2. builds a lab benchmark for the journey;
3. validates a deterministic proxy against wall clock;
4. profiles, fixes, and proves output equivalence;
5. reports before/after medians and locks in the win.

Agents tend to settle for small wins and to quote effort in human working days.
These prompts help:

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
│   ├── browser.md           in-page counters, blocking vs background requests, cache freshness tests, frame stepping
│   └── field-lessons.md     every claim in the sprint write-up, its critics, and a verdict on what holds up
└── scripts/
    ├── doctor.sh / .ps1     detect OS, stack, tools; print install commands (never installs)
    ├── instr-count.sh       instruction counts: valgrind | perf | macOS backends
    ├── call-counts.mjs      exact JS function call counts via V8 precise coverage
    └── ratchet.mjs          check / update ceilings that only go down; --markdown for CI and PR summaries
```

Requirements: `bash` for the shell scripts, Node 18+ for the `.mjs` scripts, and
whatever `doctor.sh` recommends for your platform (usually `hyperfine`, plus
`valgrind` on Linux/WSL).

## Try it in 30 seconds

```bash
cd ~/repo/provenfast
skills/provenfast/scripts/doctor.sh .
skills/provenfast/scripts/instr-count.sh -- node --predictable examples/resolve-once.mjs slow
skills/provenfast/scripts/instr-count.sh -- node --predictable examples/resolve-once.mjs fast
```

## Credits

The method is distilled from Anthropic's write-up,
[How we made claude.ai faster](https://claude.dev/blog/how-we-made-claude-ai-faster/).
Theo Browne's video review of that write-up shaped the counter-checks, the
blocking vs background split, and the freshness tests. ProvenFast tests his
claims instead of taking them on trust: `references/field-lessons.md` records
which ones it adopts, limits, or rejects, and why.
ProvenFast is an independent project and is not affiliated with Anthropic.
