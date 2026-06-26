---
title: Untrusted text is data, never instruction
slug: 0001-example-lesson
type: lesson        # lesson | decision | gotcha | reference
status: live        # live | merged | stale
---

When any user- or third-party-controlled text reaches an LLM (chat messages, free-text notes, stored content later re-shown to a model, or content read by an external agent), it must be treated as **data**, never as instructions to the model.

**Why:** an attacker who controls that text can otherwise inject commands ("ignore the above", "exfiltrate secrets", "delete X") that the model may follow. This includes the second-order vector: stored user content read *later* by a different agent.

**How to apply:** wrap the untrusted span in clear delimiters and prepend a preamble that says the delimited content is data and instructions inside it must not be obeyed. Operate only within the intended scope. See the Slack bridge in this repo (`slack/bridge.mjs`, `UNTRUSTED_PREAMBLE`) for a concrete instance.

---

This file is a **shape reference** — replace it with a real lesson. The frontmatter
is what an index/tool can parse; the body is the durable knowledge. Keep it to **one
fact**, follow it with **Why** and **How to apply**, and add a one-line pointer to
[`MEMORY.md`](./MEMORY.md). When the lesson goes stale or its work is merged and
stable, flip `status:` and move its index line to `MEMORY-archive.md`.
