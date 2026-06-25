// ─────────────────────────────────────────────────────────────────────────────
// Atlantis · Reporte diario a Slack (job programado).
//
// Es el ÚNICO canal interno→Slack, y es deliberado: corré esto por cron (ej. 1×/día)
// para que el Atlantis-de-Slack publique una daily AGREGADA del día — no actividad en
// vivo de tu entorno. Toma la actividad git del día, le pide a Claude Code que la
// resuma como standup, y la postea al canal.
//
// Uso:  ATLANTIS_REPO=/ruta/al/repo SLACK_BOT_TOKEN=… SLACK_REPORT_CHANNEL=#dailys \
//       node slack/daily-report.mjs
// Cron: 0 9 * * 1-5  (9am, días hábiles)
// ─────────────────────────────────────────────────────────────────────────────

import { WebClient } from '@slack/web-api'
import { execFile } from 'node:child_process'

const REPO = process.env.ATLANTIS_REPO || process.cwd()
const CLAUDE = process.env.CLAUDE_BIN || 'claude'
const CHANNEL = process.env.SLACK_REPORT_CHANNEL || '#dailys'
const SINCE = process.env.ATLANTIS_REPORT_SINCE || 'midnight'

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { cwd: REPO, timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, ...opts },
      (err, stdout) => (err && !stdout ? reject(err) : resolve(String(stdout)))))

const gitLog = await run('git', ['log', `--since=${SINCE}`, '--pretty=format:- %s (%an)']).catch(() => '')

if (!gitLog.trim()) {
  console.log('Sin actividad git en el período; no se postea daily.')
  process.exit(0)
}

const prompt =
  `Sos Atlantis escribiendo la daily del equipo para Slack. Esta es la actividad git de hoy:\n\n${gitLog}\n\n` +
  `Resumila como un standup breve y claro (voseo Rioplatense, sin marketingspeak): qué se avanzó, ` +
  `agrupado por tema, 4-7 bullets máximo. NO inventes nada que no esté en el log. Terminá con una línea de "foco sugerido para hoy".`

const { result } = await run(CLAUDE, ['-p', prompt, '--output-format', 'json'])
  .then((out) => { try { return JSON.parse(out) } catch { return { result: gitLog } } })

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)
await slack.chat.postMessage({
  channel: CHANNEL,
  text: `🔱 *Daily de Atlantis*\n\n${result}`,
})
console.log('Daily posteada a', CHANNEL)
