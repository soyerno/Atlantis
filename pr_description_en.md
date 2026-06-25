# Pull Request (PR) Description · Gemini / Antigravity Integration

## 1. Suggested Title
`feat: add native support for Gemini / Antigravity ecosystem and local simulator`

---

## 2. Executive Summary
This Pull Request introduces native compatibility with the **Antigravity (Gemini)** ecosystem to the **Atlantis** multi-agent orchestrator. Through this integration, Atlantis transitions from being a *Claude Code* exclusive tool to a cross-platform solution utilizing Antigravity's **Customizations (Skills)**.

### Key Changes Included:
- **Antigravity Skill Structure**: Implemented `.agents/skills/atlantis/SKILL.md` to guide Gemini agents in running the 6 acts of the orchestrator both sequentially and in parallel.
- **Local Simulation Harness**: Created an interactive Node.js script (`atlantis-harness-gemini.mjs`) to test and validate the full Atlantis workflow locally (Oracle, Heralds, Artisans, Guardians, Judges, and Decree).
- **Dedicated Config Schema**: Introduced a structured JSON file (`atlantis.config.json`) to define agent profiles, guardians, and dispatch preambles.
- **Documentation Updates**: Expanded both `README.md` and `README.en.md` to include compatibility requirements and usage guides for both Claude Code and Antigravity.

---

## 3. Detailed Table of Changes by File

| File | Change Type | Lines Added/Modified | Purpose & Description |
| :--- | :--- | :---: | :--- |
| [`.agents/skills/atlantis/SKILL.md`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/.agents/skills/atlantis/SKILL.md) | **Created** | +52 | Defines the "Orquestador Atlantis" skill for Antigravity. Provides instructions in YAML and Markdown to guide the LLM agent through the 6 phases: Oracle, Heralds, Artisans, Guardians, Judges, and Decree. |
| [`integrations/antigravity/atlantis-harness-gemini.mjs`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/integrations/antigravity/atlantis-harness-gemini.mjs) | **Created** | +410 | CLI simulator script in Node.js. Implements: <br>• Keyword-based routing.<br>• Interactive CLI prompting (`readline`) to allow hot-reloading (editing, adding, or deleting) of Artisans and Guardians (Human-in-the-loop).<br>• Simulated audits with blocker and warning findings.<br>• Adversarial voting from the Three Judges (Minos, Rhadamanthus, Aeacus).<br>• Consolidating findings into a Markdown "Decree". |
| [`integrations/antigravity/atlantis.config.json`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/integrations/antigravity/atlantis.config.json) | **Created** | +14 | Default JSON configuration for the Antigravity environment. Defines Artisans (`agent-front`, `agent-back`, `agent-docs`, `agent-security`), active Guardian lenses, kickoff status, and the `dispatchPreamble`. |
| [`README.md`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/README.md) <br> [`README.en.md`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/README.en.md) | **Modified** | +21 / -1 <br> +34 / -1 | Updates the main documentation in both Spanish and English. Splits requirements for Claude Code and Gemini/Antigravity, adds CLI simulation instructions, and updates the project file mapping tables. |

---

## 4. Step-by-Step Instructions to Test the Integration

To verify the correct execution of the simulation harness and environment config:

### Prerequisites:
- Ensure **Node.js** (v16+) is installed.
- Your terminal working directory should be the root of the Atlantis repository.

### Step 1: Run a Standard Simulation (Clean audit)
Run the harness with a request related to documentation:
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs "Update the user manual and API guidelines"
```
**What to verify:**
- The **Oracle** should match keywords like `manual` or `guidelines` and route the request to `agent-docs`.
- The CLI will prompt you to confirm the proposed routing. Press `c` and then Enter.
- Press `c` and Enter to confirm the Guardians.
- The simulation should succeed and print a **✅ DECREE APPROVED** report.

### Step 2: Run a Simulation with Security Blockers (Judges Phase)
Run a request with security keywords to trigger simulated blocker audit alerts:
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs "Implement backend auth and validate session security"
```
**What to verify:**
- The **Oracle** will route the task to both `agent-back` and `agent-security`.
- Confirm both steps by typing `c` and pressing Enter.
- The **Guardians** will simulate a 🔴 BLOCKER finding on `src/auth/jwt.js` (token expires in 365 days).
- The **Judges Phase** will activate. You will see Minos, Rhadamanthus, and Aeacus cast their votes.
- Since the blocker is confirmed by majority, the output should result in a **🔴 DECREE BLOCKED** with recommended remediation steps.

### Step 3: Run in Dry-Run Mode
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs --dry-run
```
**What to verify:**
- The CLI starts in `Mode: LOW TIDE (Dry-Run)` (in yellow), executing the routing logic safely without external calls.

### Step 4: Test Interactive Configuration Edits
Start a run, and when prompted to confirm the lanes, try:
- Pressing `a` to manually add an artisan (e.g. `agent-front`).
- Pressing `e` to edit the recommended model (e.g. `gemini-1.5-pro-high-effort`).
- Pressing `d` to delete a lane.
- Confirm with `c` to verify the harness consolidates your changes.

---

## 5. Benefits for the Atlantis Community

1. **Multi-LLM & Cross-Platform Support**: Atlantis is no longer bound exclusively to Claude Code. Developers using Google's suite (such as Antigravity and the Gemini 1.5/2.5 models) can now run the same multi-agent workflow.
2. **Low-Cost Local Simulation Environment**: The Node-based harness allows developers to debug their agent roster and prompts locally without making actual LLM API calls, saving time and API token usage.
3. **Human-in-the-loop Interactive Control**: Introducing confirmation gates in the CLI allows developers to fine-tune tasks and model selections in real-time depending on their active workflow.
4. **Resiliency Against False Blockers**: Support for the Three Judges adversarial voting guarantees automated security audits are robustly checked, minimizing false positive build blockages.
