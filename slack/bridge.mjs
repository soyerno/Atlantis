// ─────────────────────────────────────────────────────────────────────────────
// Atlantis · Puente de Slack (bidireccional).
//
// Hace que Atlantis "viva en Slack": le hablás en un canal o hilo → corre la ciudad
// (Claude Code en headless) → el Decreto vuelve al hilo. Una respuesta en el mismo
// hilo CONTINÚA la tarea con el contexto vivo (vía `claude --resume <session_id>`).
//
// ── LÍMITE DE PRIVACIDAD (por diseño) ───────────────────────────────────────────
// Este puente SOLO reacciona a eventos que se originan EN SLACK. No se engancha a tus
// sesiones locales ni observa tu entorno de desarrollo: lo que pasa en tu máquina NO
// aparece acá. El único canal interno→Slack es el reporte diario programado
// (./daily-report.mjs), que es explícito y agregado, no actividad en vivo. El agente
// se comporta como si viviera en Slack, no como un espejo de tu terminal.
// ─────────────────────────────────────────────────────────────────────────────

import bolt from '@slack/bolt'
import { execFile } from 'node:child_process'

const { App } = bolt

// ── Config (env) ────────────────────────────────────────────────────────────
const REPO = process.env.ATLANTIS_REPO || process.cwd()          // repo donde vive atlantis.mjs
const SCRIPT = process.env.ATLANTIS_SCRIPT || 'atlantis.mjs'      // scriptPath relativo al repo
const CLAUDE = process.env.CLAUDE_BIN || 'claude'                 // binario de Claude Code
const TIMEOUT_MS = Number(process.env.ATLANTIS_TIMEOUT_MS || 25 * 60 * 1000)

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,   // Socket Mode: sin URL pública
  socketMode: true,
})

// thread_ts → session_id de Claude Code, para continuar el hilo con --resume.
const threads = new Map()

// Corre Claude Code en headless y devuelve { result, sessionId }.
// - petición nueva: instruye correr el Workflow de Atlantis y responder SOLO el Decreto.
// - continuación: --resume <sessionId> con el texto de la respuesta (el contexto ya vive ahí).
function runClaude({ prompt, resume }) {
  const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits']
  if (resume) args.push('--resume', resume)
  return new Promise((resolve, reject) => {
    execFile(CLAUDE, args, { cwd: REPO, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return reject(err)
      try {
        const json = JSON.parse(stdout)
        resolve({ result: json.result ?? '(sin salida)', sessionId: json.session_id ?? resume ?? null })
      } catch {
        resolve({ result: String(stdout).slice(0, 3500), sessionId: resume ?? null })
      }
    })
  })
}

const petitionPrompt = (petition) =>
  `Corré el Workflow de Atlantis con esta petición y devolvé el Decreto.\n\n` +
  `Workflow({ scriptPath: '${SCRIPT}', args: ${JSON.stringify(petition)} })\n\n` +
  `Cuando termine, tu ÚNICA respuesta debe ser el campo .synthesis del resultado (el Decreto), ` +
  `tal cual, sin preámbulo ni meta-comentario. Si el struct trae error, explicá en una frase qué faltó.`

async function handle({ text, threadTs, say, client, channel }) {
  const petition = text.replace(/<@[^>]+>/g, '').trim()   // sacar la mención
  if (!petition) return
  const resume = threads.get(threadTs)
  const thinking = await say({ thread_ts: threadTs, text: resume ? '🔱 Retomo el hilo…' : '🔱 La ciudad delibera…' })
  try {
    const { result, sessionId } = await runClaude({
      prompt: resume ? petition : petitionPrompt(petition),
      resume,
    })
    if (sessionId) threads.set(threadTs, sessionId)   // anclar el hilo a la sesión
    await client.chat.update({ channel, ts: thinking.ts, text: result.slice(0, 3900) })
  } catch (e) {
    await client.chat.update({ channel, ts: thinking.ts, text: `⚠️ La ciudad no pudo responder: ${e.message}` })
  }
}

// Petición nueva: una mención a Atlantis. La respuesta se abre en hilo.
app.event('app_mention', async ({ event, say, client }) => {
  const threadTs = event.thread_ts || event.ts
  await handle({ text: event.text, threadTs, channel: event.channel, say, client })
})

// Continuación: un mensaje en un hilo que Atlantis ya tiene anclado (sin re-mencionar).
app.message(async ({ message, say, client }) => {
  if (message.subtype || !message.thread_ts) return
  if (!threads.has(message.thread_ts)) return        // solo hilos que la ciudad inició
  await handle({ text: message.text, threadTs: message.thread_ts, channel: message.channel, say, client })
})

const PORT = Number(process.env.PORT || 3000)
await app.start(PORT)
console.log(`🔱 Atlantis vive en Slack (Socket Mode). Repo: ${REPO} · script: ${SCRIPT}`)
