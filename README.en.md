# 🐟 Pecera

**A config-driven multi-agent orchestrator for Claude Code.** A single entry point takes a natural-language request, routes it to the right expert agent(s), runs them in parallel (each isolated), passes the result through always-on guardians with adversarial verification, and fuses everything into **one** verdict.

It's the pattern Sakana AI productized as **Fugu** (orchestrator → swappable pool of experts → verification), but as a small, serverless piece that lives inside your repo and runs with Claude Code's `Workflow` tool.

> 🇦🇷 Versión en español (voz original): [README.md](./README.md)

> It was born inside **Firulapp** (a community app for pet owners) as the router for its `firu-*` agent roster. This repo extracts it into a **portable, project-agnostic** tool: you bring the roster and the guardians in a config block; Pecera brings the machinery.

---

## Requirements

- **Claude Code** with the `Workflow` tool available.
- One or more **subagents** defined in your repo's `.claude/agents/`. Every `profile` and every `guard.profile` in your config must exist as an agent there. See [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) for an agent's shape.
- No servers, dependencies, or build step. Pecera is **a single file** (`route-request.mjs`) you run with `Workflow`.

---

## The four jobs

```
        request (string)
            │
   ┌────────▼─────────┐
   │  1. CLASSIFY     │  an LLM router splits the request into "lanes" (one per profile)
   │                  │  + classifies complexity (trivial → fast-path)
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  2. DISPATCH     │  one agent per lane, IN PARALLEL, each isolated
   │                  │  (its own worktree if it touches code)
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  3. GUARD        │  ALWAYS-ON guardians audit what was dispatched
   │                  │  (security, docs, …) — a safety net, not optional
   │                  │  ↳ every 🔴 goes through adversarial skeptics:
   │                  │    it survives only if the majority confirms it
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  4. SYNTHESIZE   │  fuses lanes + VERIFIED findings into ONE verdict:
   │                  │  ✅ done · 🔴 blocker · 🟡 pending · → next step
   └──────────────────┘
```

Three shortcuts keep you from paying for the full machinery when you don't need it:

- **Trivial fast-path.** If the router marks the request as trivial and it maps to ≤1 lane, it's resolved inline: no registration, no worktrees, no guardians.
- **Conditional guardians.** Some guardians always run; others only if a lane touched a certain kind of work (e.g. you touched the front end ⇒ the flow guardian runs).
- **Adversarial verification of blockers.** A single-voice guardian can over-severize or hallucinate a 🔴 that stops the human. Before synthesizing, each 🔴 goes through 2-3 independent skeptics (repro/authority/severity lenses) that try to refute it; it survives only by majority. 🟡/⚪ findings don't pay this, and with zero 🔴 the phase is skipped entirely (no extra cost).

## Why it matters (the underlying idea)

The context window is working memory. A single agent doing everything saturates, drifts out of character, and mixes concerns. Pecera **splits the work across specialists, each with fresh context**, and reconciles at the end — closer to how a team works than to one giant prompt. The human is still the one who decides the irreversible (merge, deploy, publish): Pecera prepares and reconciles, it doesn't ship to production.

### Why not just orchestrate by hand with Claude Code?

Claude Code already ships the bricks: subagents (the `Task`/`Agent` tool) and the `Workflow` tool for deterministic fan-out. Pecera **doesn't replace them, it uses them** — it's an opinionated recipe on top:

| | Bare subagent (`Task`) | Raw `Workflow` | **Pecera** |
|---|---|---|---|
| Decides **which** expert takes the request | you, by hand | you, in the script | an **LLM router** over your roster |
| Runs several in parallel | no (one per call) | yes, you wire it | yes, **one lane per profile** |
| Post-work safety net | no | whatever you write | **always-on + conditional guardians** |
| Stops false 🔴 | no | no | **adversarial verification** (2-3 skeptics, majority) |
| Reconciles into one verdict | no | whatever you write | **structured synthesis phase** |
| Per-project configurable | — | rewrite the script | **one `CONFIG` block**, engine untouched |

Simple rule: if it's **one** expert and **one** task, just call a subagent. Pecera wins when the request **crosses several concerns** and you want something to **audit and reconcile** what they produced — without rewriting the orchestration each time.

---

## Usage

1. **Clone** this repo (or copy `route-request.mjs` into your repo).
2. **Define your roster** by editing the `CONFIG` block at the top of [`route-request.mjs`](./route-request.mjs). `Workflow` scripts run sandboxed (no filesystem access), so the config **lives inline** in the script, not in a separate imported file. [`pecera.config.example.mjs`](./pecera.config.example.mjs) is the *shape* to paste there. You must have the corresponding agents in `.claude/agents/`.
3. **Run the orchestrator** with Claude Code's `Workflow` tool, passing your request as `args`:

```js
Workflow({
  scriptPath: 'route-request.mjs',
  args: 'fix the back button on the map',
})
```

The script routes, dispatches, and synthesizes per your `CONFIG`. The return struct carries `{ request, dryRun, complexity, lanes, results, guards, verifiedBlockers, refutedBlockers, synthesis }`.

### Dry-run (verify with no side effects)

To **test the orchestrator without it doing anything real** — useful while iterating on routing or prompts — pass `dryRun`:

```js
Workflow({ scriptPath: 'route-request.mjs', args: { request: 'your request', dryRun: true } })
```

With `dryRun`: the `kickoff` is skipped (no card/issue created) and lanes run in **report mode** (no worktrees, branches, commits, issues, or cards) — they only say what they *would* do. Without it, running the orchestrator to test fires the **real** pipeline: it creates real tickets, branches, and commits.

### Anatomy of the config (the `CONFIG` block)

```js
export default {
  // (1) Roster: key = agent name in .claude/agents/, value = what it covers.
  profiles: {
    'my-front':  'frontend: components, navigation, visual bugs',
    'my-back':   'backend: API routes, domain, persistence',
    'my-docs':   'documentation: guides, READMEs, specs',
    'my-sec':    'security: auth, rules, PII, prompt-injection',
  },

  // (2) Guardians: run AFTER dispatch, audit what was produced.
  guards: [
    // always: true ⇒ always runs. when: (lanes) => bool ⇒ runs conditionally.
    { profile: 'my-sec',  lens: 'SECURITY', focus: 'auth, rules, PII', always: true },
    { profile: 'my-docs', lens: 'DOCS',     focus: 'what changed got documented', always: true },
    { profile: 'my-flow', lens: 'FLOW',     focus: 'the journey is consistent',
      when: (lanes) => lanes.some(l => l.profile === 'my-front') },
  ],

  // (3) Optional: a "kickoff" agent (ticket card, etc.) before dispatch.
  kickoff: { profile: 'my-kickoff', instructions: 'create the card in "In progress" and the branch convention' },

  // (4) Optional: execution discipline prepended to every lane (your repo's rules).
  dispatchPreamble: 'If your task involves code: fresh worktree off origin/main, validate green, commit to a branch, do NOT open a PR.',
}
```

Everything else (fast-path, parallelism, adversarial verification, return struct, router/synthesizer prompts) comes from Pecera. If you don't define `guards`, none run. If you don't define `kickoff`, registration is skipped.

---

## Structure

| File | What it is |
|---|---|
| [`route-request.mjs`](./route-request.mjs) | The generalized orchestrator. Don't touch it to use it — configure from outside. |
| [`pecera.config.example.mjs`](./pecera.config.example.mjs) | Commented example config. Copy the object into the `CONFIG` block. |
| [`examples/firulapp.config.mjs`](./examples/firulapp.config.mjs) | A real roster (20+ routable profiles + guardians) as a case study. |
| [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) | The shape of a `.claude/agents/` agent, for reference. |

## Credits

Pattern inspired by **Fugu** (Sakana AI, 2026). Implementation and generalization: Firulapp's agent roster. Licensed [MIT](./LICENSE).
