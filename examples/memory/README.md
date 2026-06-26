# 🗺️ Memory harness

A small, durable **project memory** the agents read at the start of a session and write to at the end. It's the counterpart to Atlantis: the orchestrator splits work across fresh-context experts; this harness is what carries hard-won knowledge *across* sessions so the city doesn't relearn the same lesson twice.

The context window is working memory — load it with just what's relevant. Durable knowledge lives on disk, in plain Markdown, versioned with the repo.

## The shape

```
memory/
  MEMORY.md            ← the index. Loaded into context every session. One line per fact.
  <slug>.md            ← one fact per file. Read on demand when the index says it's relevant.
  MEMORY-archive.md    ← merged/stable/stale facts, pruned out of the index but kept consultable.
```

- **`MEMORY.md` is the only thing loaded every session.** Keep it light: one line per fact (`- [Title](slug.md) — one-line hook`). If it grows, the agent reasons through noise.
- **One fact per file.** Each `<slug>.md` holds a single durable lesson with frontmatter (see [`0001-example-lesson.md`](./0001-example-lesson.md) for the shape).
- **Prune forward.** When a fact becomes merged/stable/stale, move its line to `MEMORY-archive.md` (kept, not deleted — just out of the always-loaded index). Quality of the loaded surface beats completeness.

## The loop (who reads, who writes)

- **At session start**, an agent skims `MEMORY.md` and opens only the few `<slug>.md` files the index marks relevant to the task.
- **At session close**, when non-trivial work wrapped, the agent distills the **durable** learning to a new or updated `<slug>.md` and adds its one-line pointer to `MEMORY.md`. It prunes what went stale.

## What's worth saving (and what isn't)

Save: a non-obvious gotcha and its root cause, a convention/decision and the *why*, a constraint the code doesn't state, a pointer to an external resource. Follow facts with a short **Why** and **How to apply** so the next session can act on them.

Don't save: what the repo already records (code structure, git history, a fix visible in the diff), or what only mattered to one conversation. If asked to remember something the code already says, save instead what was *non-obvious* about it.

## A single source of truth

This file-memory is the **canonical, durable** memory — readable, versioned, indexed. If you also use an ephemeral session cache (a recall plugin, scratch notes), treat it as a cache, not the source of truth: the knowledge you want to keep is distilled *here*. If the two disagree, file-memory wins.

## Adopting it

Copy `examples/memory/` to a `memory/` (or `.memory/`) directory in your repo, point your agents' system prompts at it ("read `memory/MEMORY.md` at the start of a task; distill durable learnings back at the end"), and let it grow. Wire a periodic prune so the index stays light — that discipline is the whole point.
