# 🔱 Atlantis starter kit

Everything you need to run Atlantis on your own repo, as runnable templates. Atlantis is the orchestrator; this folder is the **harness around it** — the expert agents it dispatches, and a durable memory they carry across sessions.

## What's here

| Path | What it is |
|---|---|
| [`agents/`](./agents/) | The **Artisans** (and a Guardian, and a Herald) as Claude Code subagent files. The default `CONFIG` in [`../atlantis.mjs`](../atlantis.mjs) routes to `agent-front` / `agent-back` / `agent-docs` / `agent-security` — copy these into `.claude/agents/` and the engine runs out of the box. |
| [`memory/`](./memory/) | A small **memory harness**: a durable, versioned project memory the agents read at the start of a session and distill learnings into at the end. |
| [`example.config.mjs`](./example.config.mjs) | A fuller, real-shaped roster (14 Artisans + Guardians) to paste into the `CONFIG` block as a starting point. |

## Quick start

```bash
# 1. Bring the engine + the default agents into your repo
cp path/to/atlantis/atlantis.mjs .
mkdir -p .claude/agents && cp path/to/atlantis/examples/agents/*.md .claude/agents/

# 2. (optional) adopt the memory harness
cp -r path/to/atlantis/examples/memory ./memory

# 3. Run the city with Claude Code's Workflow tool
#    Workflow({ scriptPath: 'atlantis.mjs', args: 'your request here' })
```

Then edit the `CONFIG` block atop `atlantis.mjs` to match your roster (rename the
agents, add your own Guardians). Every `profile` and `guard.profile` must have a
matching file in `.claude/agents/`.

## The shape of an agent

An Atlantis `profile` maps 1:1 to a Claude Code subagent file. Frontmatter
(`name`, `description`, `tools`) is what the harness reads; the body is the
agent's system prompt — its identity, its one concern, its NEVERs, and how it
reports back (Atlantis reads an agent's final message as the lane's output).
See [`agents/agent-docs.md`](./agents/agent-docs.md) for an annotated shape, and
the other files for filled-in Artisans.
