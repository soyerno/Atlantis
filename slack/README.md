# 🔱 Atlantis en Slack

Hacé que Atlantis **viva en Slack** como un colaborador más: le hablás en un hilo, corre la ciudad, y el **Decreto** vuelve al hilo. Una respuesta en el mismo hilo **continúa la tarea** con el contexto vivo.

```
@Atlantis arreglá el botón de volver del mapa
   └─ 🔱 La ciudad delibera…
   └─ ✅ HECHO: branch fix/back-button … · 🟡 PENDIENTE … · → PRÓXIMO PASO …
        └─ (vos, en el hilo) dale, sumale un test
              └─ 🔱 Retomo el hilo… (continúa con el contexto)
```

## Límite de privacidad (por diseño)

> El Atlantis-de-Slack **solo ve lo que se dice en Slack**, más sus propios **reportes diarios** programados. **Nunca** observa ni refleja el trabajo de tu entorno local o de desarrollo. El [`bridge.mjs`](./bridge.mjs) reacciona únicamente a eventos de Slack; no se engancha a tus sesiones locales. El único canal interno→Slack es [`daily-report.mjs`](./daily-report.mjs), que es **explícito y agregado** (un standup del día), no actividad en vivo. El agente se comporta como si viviera en Slack — no como un espejo de tu terminal.

## Cómo funciona

`bridge.mjs` corre un servidor chico (Socket Mode — **sin URL pública**) que escucha menciones a Atlantis. En cada petición:

1. Postea un ack en un hilo.
2. Corre **Claude Code en headless** (`claude -p … --output-format json`) en tu repo, instruyéndolo a correr el `Workflow` de Atlantis y devolver el Decreto.
3. Postea el Decreto al hilo y **ancla el hilo a la sesión** (`session_id`).
4. Una respuesta en ese hilo continúa la tarea con `claude --resume <session_id>` — mismo contexto, sin re-explicar.

## Requisitos

- **Claude Code CLI** instalado y **autenticado** en el host (el puente lo invoca en headless).
- El repo con `atlantis.mjs` y los agentes en `.claude/agents/` en `ATLANTIS_REPO`.
- Una **Slack app** con Socket Mode y los scopes del bot: `app_mentions:read`, `chat:write`, `channels:history` (y `groups:history` para canales privados).
- Node ≥ 18 y las deps de esta carpeta.

## Setup

```bash
cd slack
npm install

export SLACK_BOT_TOKEN=xoxb-…        # Bot User OAuth Token
export SLACK_APP_TOKEN=xapp-…        # App-Level Token (connections:write) para Socket Mode
export ATLANTIS_REPO=/ruta/al/repo   # repo donde vive atlantis.mjs
# opcionales:
export ATLANTIS_SCRIPT=atlantis.mjs  # scriptPath relativo al repo
export CLAUDE_BIN=claude             # binario de Claude Code

npm start        # levanta el puente
```

Invitá al bot al canal y mencionalo: `@Atlantis <tu petición>`.

## Reporte diario (opcional)

```bash
export SLACK_REPORT_CHANNEL=#dailys
node daily-report.mjs               # postea la daily del día
# Cron: 0 9 * * 1-5  cd /ruta && node slack/daily-report.mjs
```

Toma la actividad git del día, le pide a Claude Code que la resuma como standup, y la postea. No inventa nada fuera del log.

## Notas

- El puente guarda el mapa `hilo → sesión` en memoria. Para producción real, persistilo (un KV/archivo) si necesitás sobrevivir reinicios.
- `--permission-mode acceptEdits` deja que los Artesanos editen/commiteen en sus branches sin prompts. Ajustá según tu nivel de confianza; el contrato de Atlantis es **no abrir PRs** — el humano revisa y mergea.
