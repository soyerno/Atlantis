export const meta = {
  name: 'atlantis-orchestrator',
  description: 'Atlantis: toma una petición en lenguaje natural, la rutea al/los artesano(s) experto(s), los corre en paralelo aislados, los pasa por los Guardianes siempre-on (cada bloqueante lo pesan los tres Jueces) y funde todo en un Decreto. Config-driven (editá el bloque CONFIG).',
  phases: [
    { title: 'Oráculo', detail: 'el Oráculo lee la petición: la reparte en lanes por perfil + clasifica complejidad (trivial → corriente rápida)' },
    { title: 'Heraldos', detail: 'opcional: los Heraldos registran la iniciativa (card/ticket) ANTES de despachar' },
    { title: 'Artesanos', detail: 'un artesano por lane, en paralelo, cada uno aislado' },
    { title: 'Guardianes', detail: 'los Guardianes (always-on + condicionales) auditan lo despachado' },
    { title: 'Jueces', detail: 'cada 🔴 de un Guardián lo pesan los tres Jueces (mayoría confirma o se descarta); los 🟡/⚪ no pagan esto. Sin 🔴, se saltea' },
    { title: 'Decreto', detail: 'funde salidas + hallazgos confirmados en UN Decreto: hecho / 🔴 bloqueante / pendiente / próximo paso' },
  ],
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CONFIG — editá ESTO para tu proyecto. Es la única parte que cambiás.       ║
// ║  Forma completa y comentada: ./atlantis.config.example.mjs                  ║
// ║  Ejemplo de roster real: ./examples/example.config.mjs                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
const CONFIG = {
  // (1) Roster de Artesanos. clave = nombre del agente en .claude/agents/, valor = qué cubre (una frase).
  profiles: {
    'agent-front': 'frontend: componentes, páginas, navegación, bugs visuales/UI',
    'agent-back': 'backend: rutas API, dominio, persistencia, jobs, server actions',
    'agent-docs': 'documentación: guías, READMEs, specs, FAQ',
    'agent-security': 'seguridad: auth, control de acceso, PII, secrets, prompt-injection',
  },

  // (2) Guardianes. Corren tras los Artesanos y auditan lo producido (no cambian código).
  //     always:true ⇒ siempre. when:(lanes)=>bool ⇒ condicional según qué se despachó.
  //     Si una lane ya fue ruteada a ese perfil, el Guardián no se re-corre.
  guards: [
    { profile: 'agent-security', lens: 'SEGURIDAD', focus: 'auth, control de acceso, PII, secrets, prompt-injection', always: true },
    { profile: 'agent-docs', lens: 'DOCUMENTACIÓN', focus: 'lo que cambió quedó documentado; nada sin guía/spec', always: true },
  ],

  // (3) Opcional. Los Heraldos: registro de arranque antes de despachar (card de ticket, rama, etc.). null ⇒ se saltea.
  kickoff: null,
  // ej.: { profile: 'agent-kickoff', instructions: 'creá el card en "En curso" con label de área y la convención de rama; NO abras worktrees ni PR.' },

  // (4) Opcional. Disciplina de ejecución que se antepone a cada Artesano.
  dispatchPreamble:
    'EJECUCIÓN:\n' +
    '- Si tu tarea es AUDITAR/reportar sin cambios: NO crees worktree ni PR. Devolvé el reporte (hallazgos, archivo:línea, severidad).\n' +
    '- Si implica CAMBIOS de código: creá tu worktree off origin/main fresco (git fetch origin && git worktree add <ruta-fuera-del-repo> -b <branch> origin/main), hacé el cambio, corré la validación del repo hasta verde, commiteá en tu branch. NO abras PR — el humano revisa y abre los PRs. Reportá honesto: branch, archivos, salida de validación, qué quedó pendiente.',
}
// ╚══════════════════════════════════════════════ fin CONFIG ═══════════════════╝

const PROFILES = CONFIG.profiles || {}
const GUARDS_CFG = CONFIG.guards || []
const PREAMBLE = CONFIG.dispatchPreamble || ''

// La petición entra por args (string o { request, dryRun }). GOTCHA: el harness puede entregar
// args como STRING (JSON serializado) aunque pases un objeto. Sin normalizar, un
// { request, dryRun } llega como texto, `typeof === 'object'` falla y dryRun se pierde →
// corrida REAL en vez de ensayo (worktrees/commits). Parseamos un string JSON antes de leer.
const ARGS = (() => {
  if (typeof args === 'string') {
    const s = args.trim()
    if (s.startsWith('{') || s.startsWith('[')) { try { return JSON.parse(s) } catch { /* texto plano */ } }
  }
  return args
})()
const request = typeof ARGS === 'string' ? ARGS.trim() : (ARGS?.request ?? '').trim()
if (!request) {
  log('Sin petición. Pasala como args, ej: { "args": "arreglá el botón de volver" }')
  return { error: 'no-request' }
}
if (!Object.keys(PROFILES).length) {
  log('CONFIG.profiles vacío: definí tu roster de Artesanos en el bloque CONFIG arriba del script.')
  return { error: 'no-profiles' }
}

// MAREA BAJA (dry-run): para VERIFICAR la ciudad sin side-effects. Saltea a los Heraldos y corre
// los Artesanos en modo-reporte (sin worktrees/ramas/commits/issues). Pasalo como
// { "args": { "request": "...", "dryRun": true } }, o fijalo con CONFIG.dryRun.
const dryRun = (typeof ARGS === 'object' && ARGS?.dryRun === true) || CONFIG.dryRun === true
if (dryRun) log('MAREA BAJA (dry-run): sin Heraldos, Artesanos en modo-reporte (cero side-effects).')

const ROUTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lanes', 'note', 'complexity'],
  properties: {
    complexity: {
      type: 'string',
      enum: ['trivial', 'standard'],
      description: 'trivial = pregunta respondible con conocimiento del repo, fix mínimo sin impacto de arquitectura/seguridad, o edición cosmética, que mapea a lo sumo UNA lane. standard = todo lo demás. REGLA DURA: si toca auth/seguridad/datos sensibles ⇒ standard. Si cruza ≥2 lanes ⇒ standard. Ante la duda ⇒ standard.',
    },
    note: { type: 'string', description: 'Una frase. Si lanes está vacío, EXPLICÁ por qué (ambiguo / pregunta / ningún artesano cubre esto).' },
    lanes: {
      type: 'array',
      description: 'Una entrada por perfil que aplica. Solo los artesanos realmente necesarios — nada especulativo.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['profile', 'task', 'reason'],
        properties: {
          profile: { type: 'string', enum: Object.keys(PROFILES) },
          task: { type: 'string', description: 'El sub-pedido acotado y accionable para ESTE artesano.' },
          reason: { type: 'string', description: 'Por qué este artesano, en una frase.' },
        },
      },
    },
  },
}

// Hallazgos de Guardianes estructurados (no prosa): habilitan el gate de severidad por
// código y el juicio adversarial de los 🔴. El schema solo fuerza la forma del output FINAL.
const GUARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clean', 'findings'],
  properties: {
    clean: { type: 'boolean', description: 'true si no encontraste ningún problema desde tu lente (findings vacío).' },
    findings: {
      type: 'array',
      description: 'Un hallazgo por problema. Vacío si clean=true.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'claim'],
        properties: {
          severity: { type: 'string', enum: ['🔴', '🟡', '⚪'], description: '🔴 bloquea avanzar · 🟡 pendiente no bloqueante · ⚪ informativo' },
          file: { type: 'string', description: 'archivo:línea afectado, o "" si no aplica.' },
          claim: { type: 'string', description: 'Afirmación verificable, una frase: qué está mal y por qué.' },
          repro: { type: 'string', description: 'Pasos de repro si aplica, o "".' },
        },
      },
    },
  },
}

// Veredicto de un Juez sobre un 🔴: ¿se sostiene o se refuta?
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'true si el bloqueante NO se sostiene (falso positivo, no reproduce, fuera de scope, mal severizado). Sesgo por defecto: refuted=true ante la duda.' },
    reason: { type: 'string', description: 'Una frase: por qué se sostiene o por qué se refuta.' },
  },
}

phase('Oráculo')
const menu = Object.entries(PROFILES).map(([k, v]) => `- ${k}: ${v}`).join('\n')
const routed = await agent(
  `Sos el Oráculo de Atlantis. Leé la petición y decidí qué artesano(s) deben tomarla. ` +
  `Artesanos disponibles:\n${menu}\n\n` +
  `Reglas: elegí SOLO los artesanos realmente necesarios (lo más simple que cubre el pedido). ` +
  `Si la petición cruza lanes, devolvé varias con sub-tareas acotadas y NO solapadas. ` +
  `Si ninguno encaja claro, devolvé lanes vacío. Llená SIEMPRE 'note' con una frase.\n` +
  `Clasificá 'complexity': 'trivial' SOLO si es una pregunta respondible con el repo, un fix mínimo sin impacto de arquitectura/seguridad, o algo cosmético, y mapea a ≤1 lane. Si toca auth/seguridad/datos, o cruza ≥2 lanes, o dudás ⇒ 'standard'.\n\n` +
  `PETICIÓN:\n${request}`,
  { label: 'oráculo', phase: 'Oráculo', schema: ROUTE_SCHEMA, effort: 'low' }
)

const lanes = (routed?.lanes ?? []).filter(l => PROFILES[l.profile])
const complexity = routed?.complexity === 'trivial' ? 'trivial' : 'standard'

// Corriente rápida: petición trivial que mapea a ≤1 lane se resuelve directo — sin Heraldos,
// sin worktrees, sin Guardianes. Gate conservador: el Oráculo ya marcó standard ante
// cualquier roce de seguridad/datos o ≥2 lanes.
if (!dryRun && complexity === 'trivial' && lanes.length <= 1) {
  const lane = lanes[0]
  log(`Corriente rápida (trivial${lane ? `, lane única ${lane.profile}` : ', sin lane'}): resuelvo directo. ${routed?.note ?? ''}`)
  const answer = await agent(
    (lane ? `${lane.task}\n\n(Petición original: ${request})\n\n` : `${request}\n\n`) +
    `Es una petición TRIVIAL en corriente rápida. Resolvé directo:\n` +
    `- Si es una PREGUNTA: contestala con lo que sabés del repo, conciso.\n` +
    `- Si es un fix mínimo de código: hacé el cambio en branch, NO abras PR, reportá branch + archivos.\n` +
    `NO es una iniciativa: no registres tickets ni convoques Guardianes.`,
    { label: lane ? `swift:${lane.profile}` : 'swift:direct', phase: 'Oráculo', effort: 'low', ...(lane ? { agentType: lane.profile } : {}) }
  )
  return { request, fastPath: true, complexity, lane: lane?.profile ?? null, answer, note: routed?.note }
}

if (!lanes.length) {
  const why = routed?.note ?? 'sin razón dada'
  log(`Ningún artesano aplica: ${why}. Manejalo en el hilo principal.`)
  return { lanes: [], note: why }
}
log(`Ruteado a ${lanes.length} lane(s): ${lanes.map(l => l.profile).join(', ')}`)

// Heraldos: opcional. Registro de arranque ANTES de despachar (no retroactivo).
// En marea baja se saltea (los Heraldos suelen crear card/issue = side-effects).
let kickoff = null
if (CONFIG.kickoff?.profile && !dryRun) {
  phase('Heraldos')
  kickoff = await agent(
    `Sos ${CONFIG.kickoff.profile}, Heraldo de Atlantis: registrás la iniciativa en el minuto cero, ANTES de que se codee.\n\n` +
    `INICIATIVA:\n${request}\n\n` +
    `Se va a despachar a: ${lanes.map(l => `${l.profile} (${l.task})`).join(' · ')}.\n\n` +
    `${CONFIG.kickoff.instructions || 'Hacé SOLO el registro de apertura. NO push/PR/merge.'}\n` +
    `Si esto NO es una iniciativa real (pregunta, fix trivial), NO registres nada y decílo.`,
    { label: CONFIG.kickoff.profile, phase: 'Heraldos', agentType: CONFIG.kickoff.profile }
  )
  log(`Heraldos: ${kickoff ? 'registraron' : '(omitido — sin salida)'}`)
}

phase('Artesanos')
// Cada lane en paralelo. Cada artesano crea su propio aislamiento (worktree) vía la
// disciplina del dispatchPreamble — no usamos isolation:'worktree' del harness porque
// ramaría desde el HEAD actual, no desde origin/main fresco.
const DRYRUN_PREAMBLE =
  'MAREA BAJA (verificación): NO ejecutes side-effects. Prohibido crear worktrees, ramas, commits, ' +
  'PRs, issues, cards o escribir archivos. SOLO analizá y reportá qué HARÍAS (plan + archivos que tocarías + riesgos). Es un ensayo, no la corrida real.'
const dispatched = await parallel(lanes.map(lane => () =>
  agent(
    `${lane.task}\n\n(Petición original: ${request})\n\n${dryRun ? DRYRUN_PREAMBLE : PREAMBLE}`,
    { label: lane.profile, phase: 'Artesanos', agentType: lane.profile }
  ).then(out => ({ profile: lane.profile, task: lane.task, output: out }))
))

const results = dispatched.filter(r => r && r.output)
const failed = dispatched.filter(r => r && !r.output)
if (failed.length) log(`⚠ ${failed.length} artesano(s) sin salida: ${failed.map(r => r.profile).join(', ')}`)

// Guardianes: siempre-on (+ condicionales). Red de seguridad por defecto — el Oráculo
// pudo no ver el riesgo; esto sí. Si una lane YA fue ruteada a un Guardián, no se re-corre.
phase('Guardianes')
const alreadyRouted = new Set(lanes.map(l => l.profile))
const producido = results.length
  ? results.map(r => `### [${r.profile}] ${r.task}\n${String(r.output).slice(0, 1800)}`).join('\n\n')
  : '(los artesanos no produjeron salida)'
const GUARDS = GUARDS_CFG
  .filter(g => g.always || (typeof g.when === 'function' && g.when(lanes)))
  .filter(g => !alreadyRouted.has(g.profile))
const guards = await parallel(GUARDS.map(g => () =>
  agent(
    `Sos el Guardián ${g.lens} (${g.profile}) de Atlantis. Se despachó una petición y los artesanos produjeron esto:\n\n${producido}\n\n` +
    `Petición original: ${request}\n\n` +
    `Auditá lo despachado desde tu lente (${g.lens}: ${g.focus}). ` +
    `Si alguna lane creó una rama/worktree, revisá su diff vs origin/main y enfocá ahí. ` +
    `NO cambies código. Devolvé tus hallazgos ESTRUCTURADOS (uno por problema): severidad (🔴 bloquea / 🟡 pendiente / ⚪ informativo), archivo:línea, una afirmación verificable, y repro si aplica. ` +
    `Reservá 🔴 para lo que de verdad impide avanzar — va a pasar por los tres Jueces. Si está limpio, clean:true y findings vacío.`,
    { label: `guardián:${g.profile}`, phase: 'Guardianes', agentType: g.profile, schema: GUARD_SCHEMA }
  ).then(out => ({ profile: g.profile, lens: g.lens, findings: out?.findings ?? [], clean: out?.clean ?? false }))
))
const guardResults = guards.filter(Boolean)
log(`Guardianes: ${guardResults.map(g => g.profile).join(' + ') || '(omitidos)'}`)

// Los tres Jueces (juicio adversarial): un Guardián de una sola voz puede sobre-severizar o
// alucinar un 🔴 que frena al humano. Antes de elevarlo, cada 🔴 pasa por los tres Jueces de
// Atlantis (Minos, Radamantis, Éaco — tres lentes distintas) que intentan REFUTARLO; sobrevive
// solo si la MAYORÍA lo confirma (≥2 de 3). Los 🟡/⚪ no pagan este acto. Sin 🔴, se saltea entero.
const blockers = guardResults.flatMap(g =>
  (g.findings ?? []).filter(f => f.severity === '🔴').map(f => ({ ...f, guard: g.profile, lens: g.lens })))
let verifiedBlockers = []
let refutedBlockers = []
if (blockers.length) {
  phase('Jueces')
  const JUECES = [
    'MINOS (repro): ¿realmente reproduce con los pasos dados? ¿el archivo:línea existe y dice lo que el hallazgo afirma?',
    'RADAMANTIS (autoridad): ¿está dentro del scope de la petición, o es deuda preexistente / fuera de alcance que no debería bloquear ESTE trabajo?',
    'ÉACO (severidad): ¿es de verdad 🔴 que impide avanzar, o un 🟡 sobre-severizado?',
  ]
  const verdicts = await parallel(blockers.map(b => () =>
    parallel(JUECES.map(juez => () =>
      agent(
        `Sos uno de los tres Jueces de Atlantis. Pesás un hallazgo BLOQUEANTE (🔴) que un Guardián levantó. Tu deber es intentar REFUTARLO desde tu lente — ${juez}\n\n` +
        `HALLAZGO (de ${b.guard} / ${b.lens}):\n${b.claim}\n` +
        (b.file ? `Archivo: ${b.file}\n` : '') +
        (b.repro ? `Repro afirmada: ${b.repro}\n` : '') +
        `\nPetición original: ${request}\n\n` +
        `Verificá contra el repo (Read/Grep; git diff vs origin/main si una lane creó rama). ` +
        `Sesgo por defecto: refuted=true ante la duda — un 🔴 solo se sostiene si lo CONFIRMÁS. NO cambies código.`,
        { label: `juez:${b.guard}`, phase: 'Jueces', agentType: b.guard, effort: 'high', schema: VERDICT_SCHEMA }
      )
    )).then(vs => {
      const votes = vs.filter(Boolean)
      const confirms = votes.filter(v => !v.refuted).length
      return { ...b, survives: confirms >= 2, confirms, total: votes.length, verdicts: votes }
    })
  ))
  verifiedBlockers = verdicts.filter(v => v.survives)
  refutedBlockers = verdicts.filter(v => !v.survives)
  log(`Los tres Jueces: ${verifiedBlockers.length}/${blockers.length} bloqueante(s) confirmado(s) por mayoría; ${refutedBlockers.length} refutado(s).`)
}

// El Decreto: funde salidas de Artesanos + hallazgos (bloqueantes YA juzgados) en UN
// veredicto. Reconcilia, no re-despacha ni abre PRs.
phase('Decreto')
const fmtF = (f) => `- ${f.severity} [${f.guard}/${f.lens}] ${f.claim}${f.file ? ` (${f.file})` : ''}`
const nonBlockers = guardResults.flatMap(g =>
  (g.findings ?? []).filter(f => f.severity !== '🔴').map(f => ({ ...f, guard: g.profile, lens: g.lens })))
const cleanGuards = guardResults.filter(g => g.clean || !(g.findings ?? []).length).map(g => g.profile)
const hallazgos = (
  (verifiedBlockers.length
    ? `BLOQUEANTES CONFIRMADOS (por mayoría de los tres Jueces, ${'>'}=2/3):\n${verifiedBlockers.map(fmtF).join('\n')}\n\n`
    : (blockers.length ? `BLOQUEANTES: ninguno de los ${blockers.length} 🔴 sobrevivió el juicio.\n\n` : ``)) +
  (refutedBlockers.length
    ? `🔴 REFUTADOS (un Guardián los marcó bloqueantes; los Jueces los descartaron — NO los presentes como bloqueantes):\n${refutedBlockers.map(b => `- ${b.claim} → refutado: ${(b.verdicts.find(v => v.refuted)?.reason) ?? 'mayoría refutó'}`).join('\n')}\n\n`
    : ``) +
  (nonBlockers.length ? `OTROS HALLAZGOS (🟡/⚪):\n${nonBlockers.map(fmtF).join('\n')}\n\n` : ``) +
  (cleanGuards.length ? `Limpio según: ${cleanGuards.join(', ')}.` : ``)
).trim() || '(sin Guardianes corridos o todos limpios)'
const synthesis = await agent(
  `Sos el Decreto de Atlantis: el veredicto final de la ciudad. Se despachó una petición y los artesanos + Guardianes produjeron esto.\n\n` +
  (dryRun ? `(MAREA BAJA: ensayo sin side-effects. Los artesanos reportaron qué HARÍAN, no lo que hicieron. El Decreto debe hablar en condicional.)\n\n` : ``) +
  `PETICIÓN ORIGINAL:\n${request}\n\n` +
  `SALIDAS DE LOS ARTESANOS:\n${producido}\n\n` +
  `HALLAZGOS DE LOS GUARDIANES (los bloqueantes ya pasaron por los tres Jueces):\n${hallazgos}\n\n` +
  `Devolvé UN Decreto reconciliado, conciso, en este orden:\n` +
  `1. 🔴 BLOQUEANTES primero — usá SOLO los "BLOQUEANTES CONFIRMADOS". Los "🔴 REFUTADOS" NO son bloqueantes (los Jueces los descartaron); no los nombres como tales. Si no hay confirmados, decí "sin bloqueantes".\n` +
  `2. ✅ HECHO: qué quedó listo (branches creadas, archivos tocados).\n` +
  `3. 🟡 PENDIENTE: lo no resuelto.\n` +
  `4. → PRÓXIMO PASO para el humano (que es quien abre/mergea los PRs).\n` +
  `NO re-despaches trabajo, NO abras ni mergees PRs. Solo reconciliá lo que ya hay.`,
  { label: 'decreto', phase: 'Decreto', effort: 'high' }
)
log('Decreto emitido.')

return {
  request,
  dryRun,
  complexity,
  lanes: lanes.map(l => ({ profile: l.profile, reason: l.reason })),
  kickoff,
  results,
  failed: failed.map(r => r.profile),
  guards: guardResults,
  verifiedBlockers: verifiedBlockers.map(b => ({ guard: b.guard, claim: b.claim, file: b.file, confirms: b.confirms, total: b.total })),
  refutedBlockers: refutedBlockers.map(b => ({ guard: b.guard, claim: b.claim, reason: b.verdicts.find(v => v.refuted)?.reason ?? null })),
  synthesis,
}
