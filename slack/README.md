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

> El Atlantis-de-Slack solo **se dispara** por lo que se dice **en Slack**, más sus propios **reportes diarios** programados: el [`bridge.mjs`](./bridge.mjs) reacciona únicamente a eventos de Slack y no se engancha a tus sesiones locales. Pero ese límite es sobre **qué lo activa**, no sobre **a qué puede acceder** una corrida disparada. Claude Code corre con `cwd` en tu repo: según el `--permission-mode` y las tools habilitadas, una corrida puede leer archivos del host fuera del repo si un usuario allowlisted se lo pide (y `plan` **no** bloquea lecturas). La frontera real es el allowlist (`SLACK_ALLOWED_USERS`), no el preámbulo anti-inyección, que es best-effort.
>
> El único canal interno→Slack es [`daily-report.mjs`](./daily-report.mjs) (un standup agregado, no actividad en vivo). Para que NO pueda leer nada fuera del git log que resume, corre con las tools de lectura/exec deshabilitadas (`--disallowedTools Read,Bash,…`): el git log viaja inline en el prompt, así una inyección por commit-message no tiene cómo alcanzar un archivo del host. Si subís el puente a `acceptEdits` para que los Artesanos editen, endurecé del mismo modo (restringí tools/cwd) en vez de confiar en el preámbulo.

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
export SLACK_ALLOWED_USERS=U123,U456 # OBLIGATORIO: IDs de Slack autorizados. VACÍO ⇒ se rechaza TODO (fail-closed)
# opcionales:
export SLACK_ALLOWED_CHANNELS=C123   # restringir a canales (vacío ⇒ no filtra por canal)
export ATLANTIS_SCRIPT=atlantis.mjs  # scriptPath relativo al repo
export CLAUDE_BIN=claude             # binario de Claude Code
export ATLANTIS_PERMISSION_MODE=plan # 'plan' (default, read-only) o 'acceptEdits' (los Artesanos commitean)

npm start        # levanta el puente
```

> **`SLACK_ALLOWED_USERS` es obligatorio.** Sin él, el bot rechaza a todos (fail-closed): no es un agujero, pero el bot no responde nada hasta que listés los IDs autorizados. Es la frontera de confianza real — quien esté ahí puede disparar corridas de Claude Code sobre tu repo.

Invitá al bot al canal y mencionalo: `@Atlantis <tu petición>`.

## Reporte diario (opcional)

```bash
export SLACK_BOT_TOKEN=xoxb-…        # mismo bot token que el puente
export ATLANTIS_REPO=/ruta/al/repo   # OBLIGATORIO: si falta, el git log apunta a slack/ y no postea nada
export SLACK_REPORT_CHANNEL=#dailys
node daily-report.mjs               # postea la daily del día
# Cron: 0 9 * * 1-5  cd /ruta && node slack/daily-report.mjs
```

Toma la actividad git del día, le pide a Claude Code que la resuma como standup, y la postea. No inventa nada fuera del log. **Sin `ATLANTIS_REPO`**, el script usa `cwd` (que tras `cd slack` es la carpeta `slack/`), el git log sale vacío y la daily no se publica.

## Notas

- El puente guarda el mapa `hilo → sesión` en memoria. Para producción real, persistilo (un KV/archivo) si necesitás sobrevivir reinicios.
- **El default es `plan` (read-only): en `plan` ningún Artesano escribe ni commitea** — el ejemplo de arriba (branch `fix/back-button`) NO ocurre hasta que subas el modo. Para que los Artesanos editen/commiteen en sus branches sin prompts, exportá `ATLANTIS_PERMISSION_MODE=acceptEdits` (ver Setup). Ajustá según tu nivel de confianza en el allowlist; el contrato de Atlantis sigue siendo **no abrir PRs** — el humano revisa y mergea.
