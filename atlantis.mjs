// NOTA: NO importamos readline (ni nada de Node) en el tope. Los scripts de `Workflow` de
// Claude Code corren sandboxeados SIN Node API — un `import` top-level reventaría al CARGAR,
// rompiendo ese path. La interactividad (modo antigravity/Node) usa un import LAZY dentro de
// confirmLanes/confirmGuards, que nunca se evalúa bajo el Workflow. Así conviven ambos paths.

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
        required: ['profile', 'task', 'reason', 'score', 'model'],
        properties: {
          profile: { type: 'string', enum: Object.keys(PROFILES) },
          task: { type: 'string', description: 'El sub-pedido acotado y accionable para ESTE artesano.' },
          reason: { type: 'string', description: 'Por qué este artesano, en una frase.' },
          score: { type: 'integer', minimum: 1, maximum: 5, description: 'Puntaje de complejidad de 1 a 5 (1=trivial/docs, 5=crítico/seguridad/arquitectura).' },
          model: { type: 'string', description: 'Modelo recomendado para esta lane según el score (ej. gemini-1.5-flash para score 1-2, gemini-1.5-pro para score 3-4, claude-3-5-sonnet o gemini-2.5-pro para score 5).' },
        },
      },
    },
  },
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  fgRed: '\x1b[31m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgCyan: '\x1b[36m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

async function confirmLanes(lanes) {
  // Sandbox del Workflow (sin `process`) o entorno no interactivo ⇒ auto-proceder, sin import.
  if (typeof process === 'undefined' || !process.stdin?.isTTY) {
    log('Oráculo', 'Entorno no interactivo detectado. Procediendo con el ruteo automático...');
    return lanes;
  }
  // Solo acá (path Node interactivo) cargamos readline, lazy. Si no está, auto-proceder.
  let readline;
  try { readline = (await import('node:readline')).default; }
  catch { log('Oráculo', 'readline no disponible; procediendo con el ruteo automático.'); return lanes; }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise(resolve => rl.question(query, resolve));

  while (true) {
    console.log(`\n🔱 ${colors.bright}${colors.fgCyan}PROPUESTA DE RUTEO Y MODELOS (Sugerida por Oráculo)${colors.reset}`);
    lanes.forEach((lane, idx) => {
      console.log(`[${idx + 1}] Artesano: ${colors.bright}${lane.profile}${colors.reset}`);
      console.log(`    ${colors.dim}Tarea:${colors.reset}  ${lane.task}`);
      console.log(`    ${colors.dim}Razón:${colors.reset}  ${lane.reason}`);
      console.log(`    ${colors.dim}Score:${colors.reset}  ${lane.score || 3}/5`);
      console.log(`    ${colors.dim}Modelo:${colors.reset} ${colors.fgYellow}${lane.model || 'gemini-1.5-pro'}${colors.reset}`);
    });
    console.log(`====================================================`);

    console.log(`Opciones: [c] Confirmar y continuar | [e] Editar lane | [a] Agregar lane | [d] Eliminar lane | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return lanes;
    } else if (ans === 'x') {
      rl.close();
      log('Oráculo', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO ARTESANO ---`);
      const profile = await question(`Nombre del perfil (disponibles: ${Object.keys(PROFILES).join(', ')}): `);
      if (!PROFILES[profile]) {
        console.log(`Perfil inválido: "${profile}"`);
        continue;
      }
      const task = await question(`Tarea del artesano: `);
      const reason = await question(`Razón de la selección: `);
      const scoreInput = await question(`Score de dificultad (1-5) [3]: `);
      const score = parseInt(scoreInput.trim(), 10) || 3;
      const model = await question(`Modelo recomendado [gemini-1.5-pro]: `) || 'gemini-1.5-pro';
      lanes.push({ profile, task, reason, score, model });
    } else if (ans === 'd') {
      const idxInput = await question(`Número del artesano a eliminar (1-${lanes.length}): `);
      const idx = parseInt(idxInput.trim(), 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < lanes.length) {
        lanes.splice(idx, 1);
        console.log(`Artesano eliminado.`);
      } else {
        console.log(`Índice inválido.`);
      }
    } else if (ans === 'e') {
      const idxInput = await question(`Número del artesano a editar (1-${lanes.length}): `);
      const idx = parseInt(idxInput.trim(), 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < lanes.length) {
        const lane = lanes[idx];
        console.log(`\nEditando artesano [${lane.profile}] (deja en blanco para mantener actual):`);
        const newTask = await question(`Tarea [${lane.task}]: `);
        if (newTask.trim()) lane.task = newTask.trim();
        const newReason = await question(`Razón [${lane.reason}]: `);
        if (newReason.trim()) lane.reason = newReason.trim();
        const newScoreInput = await question(`Score [${lane.score || 3}]: `);
        const newScore = parseInt(newScoreInput.trim(), 10);
        if (!isNaN(newScore)) lane.score = newScore;
        const newModel = await question(`Modelo [${lane.model || 'gemini-1.5-pro'}]: `);
        if (newModel.trim()) lane.model = newModel.trim();
      } else {
        console.log(`Índice inválido.`);
      }
    }
  }
}

async function confirmGuards(guardsList) {
  // Sandbox del Workflow (sin `process`) o entorno no interactivo ⇒ auto-proceder, sin import.
  if (typeof process === 'undefined' || !process.stdin?.isTTY) {
    log('Guardianes', 'Entorno no interactivo. Procediendo con la auditoría automática...');
    return guardsList;
  }
  // Solo acá (path Node interactivo) cargamos readline, lazy. Si no está, auto-proceder.
  let readline;
  try { readline = (await import('node:readline')).default; }
  catch { log('Guardianes', 'readline no disponible; procediendo con la auditoría automática.'); return guardsList; }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise(resolve => rl.question(query, resolve));

  while (true) {
    console.log(`\n🔱 ${colors.bright}${colors.fgCyan}PROPUESTA DE GUARDIANES Y MODELOS (Para Auditoría)${colors.reset}`);
    guardsList.forEach((guard, idx) => {
      console.log(`[${idx + 1}] Guardián: ${colors.bright}${guard.profile} (${guard.lens})${colors.reset}`);
      console.log(`    ${colors.dim}Enfoque:${colors.reset} ${guard.focus}`);
      console.log(`    ${colors.dim}Modelo:${colors.reset}  ${colors.fgYellow}${guard.model || 'gemini-1.5-pro'}${colors.reset}`);
    });
    console.log(`====================================================`);

    console.log(`Opciones: [c] Confirmar y continuar | [e] Editar guardián | [a] Agregar guardián | [d] Eliminar guardián | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return guardsList;
    } else if (ans === 'x') {
      rl.close();
      log('Guardianes', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO GUARDIÁN ---`);
      const profile = await question(`Nombre del perfil (ej. agent-security): `);
      const lens = await question(`Lente (ej. SEGURIDAD): `);
      const focus = await question(`Enfoque de auditoría: `);
      const model = await question(`Modelo recomendado [gemini-1.5-pro]: `) || 'gemini-1.5-pro';
      guardsList.push({ profile, lens, focus, model });
    } else if (ans === 'd') {
      const idxInput = await question(`Número del guardián a eliminar (1-${guardsList.length}): `);
      const idx = parseInt(idxInput.trim(), 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < guardsList.length) {
        guardsList.splice(idx, 1);
        console.log(`Guardián eliminado.`);
      } else {
        console.log(`Índice inválido.`);
      }
    } else if (ans === 'e') {
      const idxInput = await question(`Número del guardián a editar (1-${guardsList.length}): `);
      const idx = parseInt(idxInput.trim(), 10) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < guardsList.length) {
        const guard = guardsList[idx];
        console.log(`\nEditando guardián [${guard.profile}] (deja en blanco para mantener actual):`);
        const newLens = await question(`Lente [${guard.lens}]: `);
        if (newLens.trim()) guard.lens = newLens.trim();
        const newFocus = await question(`Enfoque [${guard.focus}]: `);
        if (newFocus.trim()) guard.focus = newFocus.trim();
        const newModel = await question(`Modelo [${guard.model || 'gemini-1.5-pro'}]: `);
        if (newModel.trim()) guard.model = newModel.trim();
      } else {
        console.log(`Índice inválido.`);
      }
    }
  }
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
  `Sos el Oráculo de Atlantis. Leé la petición y decidí qué artesano(s) deben tomarla y qué modelo usar en base a un scoring de dificultad del veredicto del requerimiento.\n` +
  `Artesanos disponibles:\n${menu}\n\n` +
  `Reglas:\n` +
  `- Elegí SOLO los artesanos realmente necesarios (lo más simple que cubre el pedido).\n` +
  `- Si la petición cruza lanes, devolvé varias con sub-tareas acotadas y NO solapadas.\n` +
  `- Si ninguno encaja claro, devolvé lanes vacío. Llená SIEMPRE 'note' con una frase.\n` +
  `- Asigná un 'score' de 1 a 5 para cada artesano.\n` +
  `- Elige un 'model' correspondiente al score:\n` +
  `  * Score 1-2: Usa 'gemini-1.5-flash' o 'claude-3-5-haiku' (tareas de bajo riesgo/docs)\n` +
  `  * Score 3-4: Usa 'gemini-1.5-pro' o 'claude-3-5-sonnet' (tareas lógicas estándar)\n` +
  `  * Score 5: Usa 'gemini-1.5-pro-high-effort' o 'claude-3-opus' (tareas críticas, seguridad o refactor)\n\n` +
  `PETICIÓN:\n${request}`,
  { label: 'oráculo', phase: 'Oráculo', schema: ROUTE_SCHEMA, effort: 'low' }
)

// El Oráculo crasheado (fallo de infra, o salida que no matchea ROUTE_SCHEMA → null) NO debe
// confundirse con una decisión legítima de "ningún artesano aplica" (lanes:[]). Sin este chequeo,
// un router caído colapsaría al ramo sin-lanes y el consumidor no podría distinguir los dos casos.
if (!routed || !Array.isArray(routed.lanes) || typeof routed.complexity !== 'string') {
  log('El Oráculo no devolvió una ruta válida (fallo de infra o salida fuera de schema). Manejalo en el hilo principal.')
  return { error: 'oracle-failed' }
}
// let (no const): confirmLanes() reasigna lanes tras la confirmación del usuario.
let lanes = (routed.lanes ?? []).filter(l => PROFILES[l.profile])
const complexity = routed.complexity === 'trivial' ? 'trivial' : 'standard'

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
  return { request, dryRun, complexity, lanes: [], note: why }
}
log(`Ruteado a ${lanes.length} lane(s): ${lanes.map(l => l.profile).join(', ')}`)

lanes = await confirmLanes(lanes);
if (!lanes.length) {
  log('Oráculo', 'No hay lanes seleccionadas después de la confirmación del usuario. Terminando.')
  return { lanes: [], note: 'Lanes vaciadas por el usuario' }
}

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
    { label: lane.profile, phase: 'Artesanos', agentType: lane.profile, ...(lane.model ? { model: lane.model } : {}) }
  ).then(out => ({ profile: lane.profile, task: lane.task, output: out, model: lane.model || null }))
))

// Un slot que el harness rechaza antes del .then resuelve a null: no tiene profile.
// Re-asociamos cada slot a su lane por índice para que un fallo duro cuente como fallo
// (no desaparezca de results Y de failed por ser falsy).
const dispatchedByLane = lanes.map((lane, i) => {
  const r = dispatched[i]
  return (r && r.profile) ? r : { profile: lane.profile, task: lane.task, output: null }
})
const results = dispatchedByLane.filter(r => r.output)
const failed = dispatchedByLane.filter(r => !r.output)
if (failed.length) log(`⚠ ${failed.length} artesano(s) sin salida: ${failed.map(r => r.profile).join(', ')}`)

// Guardianes: siempre-on (+ condicionales). Red de seguridad por defecto — el Oráculo
// pudo no ver el riesgo; esto sí. Si una lane YA fue ruteada a un Guardián, no se re-corre.
phase('Guardianes')
const alreadyRouted = new Set(lanes.map(l => l.profile))
// El reporte del artesano es la ÚNICA señal cuando NO hay diff que el Guardián pueda releer.
// Solo acotamos cuando ESA lane dejó un diff de respaldo (creó rama/worktree): ahí el Guardián
// puede releer el diff vs origin/main si la salida se cortó. NO es cuestión de dry-run: un
// artesano audit/report-only en corrida REAL tampoco crea rama, y en dry-run nadie la crea — en
// ambos casos truncar pierde hallazgos tardíos (p.ej. seguridad) sin fallback. Detectamos el
// respaldo por lane: si la salida evidencia una rama/worktree, acotamos; si no, pasamos completo.
const CLAMP = 8000
// Respaldo REAL = el artesano declaró una rama/worktree CON NOMBRE concreto (lo que el
// dispatchPreamble pide: "Reportá honesto: branch, archivos…"). Un match suelto de la
// palabra 'rama|branch|worktree' en cualquier parte es un falso positivo: un reporte
// audit-only que dice "NO creé worktree ni rama" lo gatillaría y truncaría sin diff que
// releer, perdiendo hallazgos tardíos. Exigimos un identificador de rama afirmativo
// (p.ej. "branch: fix/foo", "rama feat/bar") — algo que un Guardián pueda releer vía
// git diff. Si no aparece, pasamos el reporte COMPLETO (es la única señal sin diff).
const hasDiffBackup = (out) => /\b(branch|rama|worktree)s?\b[ \t]*[:=]?[ \t]*[A-Za-z][\w./-]*\/[\w./-]+/i.test(String(out))
const clamp = (s, out) => (!dryRun && hasDiffBackup(out)) ? String(s).slice(0, CLAMP) : String(s)
const producido = results.length
  ? results.map(r => `### [${r.profile}] ${r.task}\n${clamp(String(r.output), r.output)}`).join('\n\n')
  : '(los artesanos no produjeron salida)'
// Dedup SOLO para guards condicionales: si su perfil ya fue ruteado como lane, no se re-corre.
// Un guard always:true NO se deduplica — es la red de seguridad independiente, y se necesita
// JUSTO cuando el artesano de ese perfil tocó el diff (no puede ser su único auditor).
const GUARDS_INITIAL = GUARDS_CFG
  .filter(g => g.always || (typeof g.when === 'function' && g.when(lanes)))
  .filter(g => g.always || !alreadyRouted.has(g.profile))
  .map(g => ({ ...g, model: g.model || 'gemini-1.5-pro' }))

const GUARDS = await confirmGuards(GUARDS_INITIAL)
const guards = await parallel(GUARDS.map(g => () =>
  agent(
    `Sos el Guardián ${g.lens} (${g.profile}) de Atlantis. Se despachó una petición y los artesanos produjeron esto:\n\n${producido}\n\n` +
    `Petición original: ${request}\n\n` +
    `Auditá lo despachado desde tu lente (${g.lens}: ${g.focus}). ` +
    `Si alguna lane creó una rama/worktree, revisá su diff vs origin/main y enfocá ahí. ` +
    `NO cambies código. Devolvé tus hallazgos ESTRUCTURADOS (uno por problema): severidad (🔴 bloquea / 🟡 pendiente / ⚪ informativo), archivo:línea, una afirmación verificable, y repro si aplica. ` +
    `Reservá 🔴 para lo que de verdad impide avanzar — va a pasar por los tres Jueces. Si está limpio, clean:true y findings vacío.`,
    { label: `guardián:${g.profile}`, phase: 'Guardianes', agentType: g.profile, schema: GUARD_SCHEMA, ...(g.model ? { model: g.model } : {}) }
  ).then(out => ({ profile: g.profile, lens: g.lens, findings: out?.findings ?? [], clean: out?.clean ?? false, errored: out == null, model: g.model || null }))
))
// Un slot que el harness rechaza ANTES del .then resuelve a null (no corrió el .then que setea
// errored:true), y filter(Boolean) lo descartaría — desaparecería de errored Y de clean, y el
// Decreto podría emitir un all-clear falso ocultando que un Guardián always-on jamás auditó.
// Re-asociamos por índice (igual que los Artesanos): un slot nulo cuenta como errored, no como limpio.
const guardResults = GUARDS.map((g, i) =>
  (guards[i] && guards[i].profile)
    ? guards[i]
    : { profile: g.profile, lens: g.lens, findings: [], clean: false, errored: true })
log(`Guardianes: ${guardResults.map(g => g.profile).join(' + ') || '(omitidos)'}`)

// Los tres Jueces (juicio adversarial): un Guardián de una sola voz puede sobre-severizar o
// alucinar un 🔴 que frena al humano. Antes de elevarlo, cada 🔴 pasa por los tres Jueces de
// Atlantis (Minos, Radamantis, Éaco — tres lentes distintas) que intentan REFUTARLO; sobrevive
// solo si la MAYORÍA de los votos válidos lo confirma. Los 🟡/⚪ no pagan este acto. Sin 🔴, se saltea entero.
//
// INDEPENDENCIA: cada Juez es una INVOCACIÓN distinta (contexto fresco) e independiente del
// hallazgo. Preferimos perfiles OTROS que el acusador, pero NO barremos al perfil acusador del
// pool: si el 🔴 es de dominio (p.ej. seguridad/auth/IDOR) y el acusador era el único agente
// competente en ese dominio, excluir su perfil deja el hallazgo en manos de jueces que no pueden
// verificarlo y, con el sesgo "refuted ante la duda", lo descartan en silencio — justo el 🔴 de
// más riesgo, juzgado por los menos competentes. Por eso el perfil acusador queda como Juez de
// ÚLTIMO recurso (una invocación fresca distinta del Guardián), garantizando una lente de dominio.
// Si quedan <2 agentes distintos, el 🔴 queda NO JUZGADO: exigimos ≥2 votos para que la mayoría signifique algo.
const blockers = guardResults.flatMap(g =>
  (g.findings ?? []).filter(f => f.severity === '🔴').map(f => ({ ...f, guard: g.profile, lens: g.lens })))
let verifiedBlockers = []
let refutedBlockers = []
let unjudgedBlockers = []
if (blockers.length) {
  phase('Jueces')
  // Orden de PRIORIDAD (no posicional ciego): cuando hay <3 agentes distintos, asignamos las
  // lentes por este orden, así la lente de severidad (ÉACO) — la razón de ser del juicio: cazar
  // un 🔴 sobre-severizado — nunca se cae primero en un roster chico. Con 2 candidatos corren
  // ÉACO + MINOS; nunca se queda solo repro+autoridad sin chequear la severidad del 🔴.
  const JUECES = [
    'ÉACO (severidad): ¿es de verdad 🔴 que impide avanzar, o un 🟡 sobre-severizado?',
    'MINOS (repro): ¿realmente reproduce con los pasos dados? ¿el archivo:línea existe y dice lo que el hallazgo afirma?',
    'RADAMANTIS (autoridad): ¿está dentro del scope de la petición, o es deuda preexistente / fuera de alcance que no debería bloquear ESTE trabajo?',
  ]
  // Pool de agentes-Juez disponibles (config-driven). Independientes del acusador por construcción.
  const judgePool = (Array.isArray(CONFIG.judges) && CONFIG.judges.length)
    ? CONFIG.judges
    : [...new Set([...Object.keys(PROFILES), ...GUARDS_CFG.map(g => g.profile)])]
  const verdicts = await parallel(blockers.map(b => () => {
    // Asignar UN agentType DISTINTO por lente. Cada agentType es una invocación única (sin
    // módulo: con candidates[i % n] un solo agente cazaría varias lentes y controlaría la mayoría).
    // Preferimos perfiles OTROS que el acusador, pero conservamos el perfil acusador al FINAL como
    // Juez de dominio de último recurso (invocación fresca, distinta del Guardián) — así un 🔴 de
    // dominio no queda sin un Juez competente. Si quedan <2 agentes distintos, el 🔴 queda NO JUZGADO.
    const candidates = [...judgePool.filter(p => p !== b.guard), ...(judgePool.includes(b.guard) ? [b.guard] : [])]
    if (candidates.length < 2) return Promise.resolve({ ...b, survives: null, confirms: 0, total: 0, verdicts: [] })
    // Una lente por agente disponible, hasta las tres lentes, EN ORDEN DE PRIORIDAD (severidad
    // primero): cada Juez es un agente distinto. Con 2 candidatos corren ÉACO+MINOS, no se omite
    // el chequeo de severidad.
    const assigned = JUECES.slice(0, candidates.length).map((juez, i) => ({ juez, agentType: candidates[i] }))
    return parallel(assigned.map(({ juez, agentType }) => () =>
      agent(
        `Sos uno de los tres Jueces de Atlantis. Pesás un hallazgo BLOQUEANTE (🔴) que un Guardián levantó. Tu deber es intentar REFUTARLO desde tu lente — ${juez}\n\n` +
        `HALLAZGO (de ${b.guard} / ${b.lens}):\n${b.claim}\n` +
        (b.file ? `Archivo: ${b.file}\n` : '') +
        (b.repro ? `Repro afirmada: ${b.repro}\n` : '') +
        `\nPetición original: ${request}\n\n` +
        `Verificá contra el repo (Read/Grep; git diff vs origin/main si una lane creó rama). ` +
        `Sesgo por defecto: refuted=true ante la duda — un 🔴 solo se sostiene si lo CONFIRMÁS. NO cambies código.`,
        { label: `juez:${agentType}`, phase: 'Jueces', agentType, effort: 'high', schema: VERDICT_SCHEMA }
      )
    )).then(vs => {
      const votes = vs.filter(Boolean)
      const confirms = votes.filter(v => !v.refuted).length
      // Mayoría sobre los Jueces ASIGNADOS (no sobre los que sobrevivieron al crash): un Juez
      // caído NO debe endurecer el umbral contra el 🔴. Si computáramos la mayoría sobre los
      // votos VÁLIDOS, un Juez nulo bajaría el divisor (3→2) y exigiría unanimidad de los 2
      // restantes — un crash volvería la confirmación MÁS difícil, justo al revés. Un Juez caído
      // cuenta como NO-confirmación contra el total asignado. Y si quedan <2 votos válidos por
      // caídas, no hay quórum: el 🔴 queda NO JUZGADO (survives=null), no se aplica la regla estricta.
      const total = assigned.length
      const survives = votes.length >= 2 ? (confirms * 2 > total) : null
      return { ...b, survives, confirms, total, verdicts: votes }
    })
  }))
  verifiedBlockers = verdicts.filter(v => v.survives === true)
  refutedBlockers = verdicts.filter(v => v.survives === false)
  unjudgedBlockers = verdicts.filter(v => v.survives === null)
  log(`Los tres Jueces: ${verifiedBlockers.length}/${blockers.length} bloqueante(s) confirmado(s) por mayoría; ${refutedBlockers.length} refutado(s)${unjudgedBlockers.length ? `; ${unjudgedBlockers.length} sin quórum (no juzgado(s))` : ''}.`)
}

// El Decreto: funde salidas de Artesanos + hallazgos (bloqueantes YA juzgados) en UN
// veredicto. Reconcilia, no re-despacha ni abre PRs.
phase('Decreto')
const fmtF = (f) => `- ${f.severity} [${f.guard}/${f.lens}] ${f.claim}${f.file ? ` (${f.file})` : ''}`
const nonBlockers = guardResults.flatMap(g =>
  (g.findings ?? []).filter(f => f.severity !== '🔴').map(f => ({ ...f, guard: g.profile, lens: g.lens })))
// Un Guardián sin salida (errored) NO es limpio: crasheó, no auditó. Solo cuenta como limpio
// el que devolvió clean:true (o findings vacío sin error). Los errored se reportan aparte.
const cleanGuards = guardResults.filter(g => !g.errored && (g.clean || !(g.findings ?? []).length)).map(g => g.profile)
const erroredGuards = guardResults.filter(g => g.errored).map(g => g.profile)
const hallazgos = (
  (verifiedBlockers.length
    ? `BLOQUEANTES CONFIRMADOS (por mayoría de votos válidos de los Jueces):\n${verifiedBlockers.map(fmtF).join('\n')}\n\n`
    : (blockers.length && !unjudgedBlockers.length ? `BLOQUEANTES: ninguno de los ${blockers.length} 🔴 sobrevivió el juicio.\n\n` : ``)) +
  (unjudgedBlockers.length
    ? `🔴 NO VERIFICADOS (sin quórum de Jueces — un fallo de infra impidió juzgarlos; NO se refutaron, tratalos con cautela como posibles bloqueantes):\n${unjudgedBlockers.map(fmtF).join('\n')}\n\n`
    : ``) +
  (refutedBlockers.length
    ? `🔴 REFUTADOS (un Guardián los marcó bloqueantes; los Jueces los descartaron — NO los presentes como bloqueantes):\n${refutedBlockers.map(b => `- ${b.claim} → refutado: ${(b.verdicts.find(v => v.refuted)?.reason) ?? 'mayoría refutó'}`).join('\n')}\n\n`
    : ``) +
  (nonBlockers.length ? `OTROS HALLAZGOS (🟡/⚪):\n${nonBlockers.map(fmtF).join('\n')}\n\n` : ``) +
  (erroredGuards.length ? `Guardianes SIN SALIDA (crashearon — NO auditaron, no son un all-clear): ${erroredGuards.join(', ')}.\n` : ``) +
  (cleanGuards.length ? `Limpio según: ${cleanGuards.join(', ')}.` : ``)
).trim() || '(sin Guardianes corridos o todos limpios)'
const synthesis = await agent(
  `Sos el Decreto de Atlantis: el veredicto final de la ciudad. Se despachó una petición y los artesanos + Guardianes produjeron esto.\n\n` +
  (dryRun ? `(MAREA BAJA: ensayo sin side-effects. Los artesanos reportaron qué HARÍAN, no lo que hicieron. El Decreto debe hablar en condicional.)\n\n` : ``) +
  `PETICIÓN ORIGINAL:\n${request}\n\n` +
  `SALIDAS DE LOS ARTESANOS:\n${producido}\n\n` +
  `HALLAZGOS DE LOS GUARDIANES (los bloqueantes ya pasaron por los tres Jueces):\n${hallazgos}\n\n` +
  `Devolvé UN Decreto reconciliado, conciso, en este orden:\n` +
  `1. 🔴 BLOQUEANTES primero — usá los "BLOQUEANTES CONFIRMADOS" y, si los hay, listá aparte los "🔴 NO VERIFICADOS" (sin quórum de Jueces) como cautela, sin afirmarlos como confirmados. Los "🔴 REFUTADOS" NO son bloqueantes (los Jueces los descartaron); no los nombres como tales. Si no hay confirmados ni no-verificados, decí "sin bloqueantes".\n` +
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
  unjudgedBlockers: unjudgedBlockers.map(b => ({ guard: b.guard, claim: b.claim, file: b.file, confirms: b.confirms, total: b.total })),
  synthesis,
}
