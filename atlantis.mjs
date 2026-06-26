import readline from 'readline';
import fs from 'fs';
import path from 'path';

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
  // (1) Roster de Artesanos de Atlantis.
  profiles: {
    'atl-po': 'product owner: priorizar backlog contra el North Star (WALM), change proposal OpenSpec antes de codear, criterios Given/When/Then, scope in/out',
    'atl-front': 'frontend: componentes React, páginas, interacción de cliente, navegación, bugs visuales/UI',
    'atl-back': 'backend: rutas API, dominio, adapters de persistencia (Firestore/JSON), jobs, server actions',
    'atl-ux': 'usabilidad/a11y: simplificar flujo, touch targets, legibilidad, no abrumar (usuario 40+)',
    'atl-flow': 'integridad de flujos: un journey de varios pasos no se solapa, no repite lo ya pedido/derivable, no se contradice ni deja dead-ends',
    'atl-brand': 'design system: fidelidad de marca, tokens, identidad visual, assets/flyers, guardián de brand-drift',
    'atl-docs': 'documentación: guías, READMEs, specs OpenSpec, artículos evergreen, FAQ, llms.txt, PENDIENTES',
    'atl-release': 'release/CI-CD: semantic-release on-merge, Conventional Commits, harness pre-commit, deploy App Hosting',
    'atl-qa': 'QA: estrategia de prueba, suite e2e Playwright como guard del MVP, regresión del flujo crítico',
    'atl-security': 'firestore.rules, prompt-injection, SSRF, gating de acceso IA, PII',
    'atl-perf': 'performance: velocidad de carga, peso del bundle inicial, TTI, cascada de fetches al montar, lazy-load/code-splitting'
  },

  // (2) Guardianes. Corren tras los Artesanos y auditan lo producido (no cambian código).
  guards: [
    { profile: 'atl-security', lens: 'SEGURIDAD-DEFENSIVO', focus: 'firestore.rules, prompt-injection, gating IA, PII, secrets/deps/CVE, headers/CSP', always: true },
    { profile: 'atl-docs', lens: 'DOCUMENTACIÓN', focus: 'funcionalidad de usuario sin guía/FAQ/artículo, feature nueva/breaking sin spec OpenSpec, README/llms.txt/PENDIENTES desactualizados', always: true },
    { profile: 'atl-flow', lens: 'INTEGRIDAD-FLUJO', focus: 'un journey de varios pasos no se solapa ni repite lo ya pedido (sobre-petición), no se contradice entre caminos, no deja dead-ends ni loops de redirect', always: false, when: ['atl-front'] },
    { profile: 'atl-perf', lens: 'PERFORMANCE', focus: 'peso del bundle inicial, cascada de fetches al montar de vistas no visibles, SSR en serie, render que bloquea el primer paint', always: false, when: ['atl-front', 'atl-back'] }
  ],

  // (3) Opcional. Los Heraldos (atl-kickoff).
  kickoff: {
    profile: 'atl-kickoff',
    instructions: '1. Registrar iniciativa: crear el card en el backlog de la iteración actual en "En curso" indicando el alcance y la convención de rama sugerida (feat/fix/chore-...). 2. NO abrir worktrees ni ramas desde el kickoff: cada lane abrirá la suya. 3. NO tocar ramas de producción ni push directo.'
  },

  // (4) Preámbulo de ejecución.
  dispatchPreamble:
    'EJECUCIÓN (sobreescribe el default del perfil):\n' +
    '- Si tu tarea es AUDITAR/reportar sin cambios de código: NO crees worktree ni PR. Devolvé el reporte (hallazgos, archivo:línea, severidad) y sumá lo no-resuelto a docs/PENDIENTES.md.\n' +
    '- Si tu tarea implica CAMBIOS de código:\n' +
    '  1. Creá tu propio worktree off origin/main fresco: git fetch origin && git worktree add <ruta-fuera-del-repo> -b <branch> origin/main. No pises branches de otras sesiones.\n' +
    '  2. Hacé los cambios; corré "npm run validate" hasta verde.\n' +
    '  3. Commiteá en tu branch. NO abras PR — el usuario revisa y abre los PRs.\n' +
    '  4. Reportá honesto: branch creada, archivos tocados, salida de validate, qué quedó pendiente.'
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

const usePaidModels = (typeof ARGS === 'object' && ARGS?.paidModels === true) || CONFIG.usePaidModels === true || (typeof process !== 'undefined' && process.argv && (process.argv.includes('--paid-models') || process.argv.includes('-p')));
const useFreeModels = !usePaidModels && ((typeof ARGS === 'object' && ARGS?.freeModels === true) || CONFIG.useFreeModels === true || (typeof process !== 'undefined' && process.argv && (process.argv.includes('--free-models') || process.argv.includes('-f'))));

if (usePaidModels) log('MODELOS PAGOS: Se forzará el uso de modelos pagos (gemini-1.5-pro / gemini-2.5-pro / claude-3-5-sonnet).');
if (useFreeModels) log('MODELOS GRATUITOS: Se forzará el uso de modelos gratuitos (gemini-1.5-flash / gemini-2.5-flash).');

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

const mapModelInput = (val, current) => {
  const clean = val.trim();
  if (!clean) return current;
  if (clean === '1') return 'gemini-1.5-flash';
  if (clean === '2') return 'gemini-2.5-flash';
  if (clean === '3') return 'gemini-1.5-pro';
  if (clean === '4') return 'gemini-2.5-pro';
  return clean;
};

async function confirmLanes(lanes) {
  if (!process.stdin.isTTY) {
    log('Oráculo', 'Entorno no interactivo detectado. Procediendo con el ruteo automático...');
    return lanes;
  }

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

    console.log(`Opciones: [c] Confirmar | [e] Editar lane | [a] Agregar lane | [d] Eliminar lane | [f] Forzar modelos gratuitos | [p] Forzar modelos pagos | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return lanes;
    } else if (ans === 'x') {
      rl.close();
      log('Oráculo', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'f') {
      lanes.forEach(lane => {
        lane.model = lane.score <= 2 ? 'gemini-1.5-flash' : 'gemini-2.5-flash';
      });
      console.log("Se han forzado modelos gratuitos para todos los artesanos.");
    } else if (ans === 'p') {
      lanes.forEach(lane => {
        lane.model = lane.score <= 2 ? 'gemini-1.5-pro' : 'gemini-2.5-pro';
      });
      console.log("Se han forzado modelos pagos para todos los artesanos.");
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
      
      console.log(`Sugerencias de modelos:`);
      console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
      console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
      const modelInput = await question(`Modelo recomendado [gemini-1.5-pro]: `);
      const model = mapModelInput(modelInput, 'gemini-1.5-pro');
      
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
        
        console.log(`Sugerencias de modelos:`);
        console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
        console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
        const newModelInput = await question(`Modelo [${lane.model || 'gemini-1.5-pro'}]: `);
        lane.model = mapModelInput(newModelInput, lane.model || 'gemini-1.5-pro');
      } else {
        console.log(`Índice inválido.`);
      }
    }
  }
}

async function confirmGuards(guardsList) {
  if (!process.stdin.isTTY) {
    log('Guardianes', 'Entorno no interactivo. Procediendo con la auditoría automática...');
    return guardsList;
  }

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

    console.log(`Opciones: [c] Confirmar | [e] Editar guardián | [a] Agregar guardián | [d] Eliminar guardián | [f] Forzar modelos gratuitos | [p] Forzar modelos pagos | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return guardsList;
    } else if (ans === 'x') {
      rl.close();
      log('Guardianes', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'f') {
      guardsList.forEach(guard => {
        guard.model = 'gemini-1.5-flash';
      });
      console.log("Se han forzado modelos gratuitos para todos los guardianes.");
    } else if (ans === 'p') {
      guardsList.forEach(guard => {
        guard.model = 'gemini-1.5-pro';
      });
      console.log("Se han forzado modelos pagos para todos los guardianes.");
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO GUARDIÁN ---`);
      const profile = await question(`Nombre del perfil (ej. agent-security): `);
      const lens = await question(`Lente (ej. SEGURIDAD): `);
      const focus = await question(`Enfoque de auditoría: `);
      
      console.log(`Sugerencias de modelos:`);
      console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
      console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
      const modelInput = await question(`Modelo recomendado [gemini-1.5-pro]: `);
      const model = mapModelInput(modelInput, 'gemini-1.5-pro');
      
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
        
        console.log(`Sugerencias de modelos:`);
        console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
        console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
        const newModelInput = await question(`Modelo [${guard.model || 'gemini-1.5-pro'}]: `);
        guard.model = mapModelInput(newModelInput, guard.model || 'gemini-1.5-pro');
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
  { label: 'oráculo', phase: 'Oráculo', schema: ROUTE_SCHEMA, effort: 'low', model: usePaidModels ? 'gemini-1.5-pro' : (useFreeModels ? 'gemini-1.5-flash' : undefined) }
)

let lanes = (routed?.lanes ?? []).filter(l => PROFILES[l.profile])
if (useFreeModels) {
  lanes.forEach(l => {
    l.model = l.score <= 2 ? 'gemini-1.5-flash' : 'gemini-2.5-flash';
  });
} else if (usePaidModels) {
  lanes.forEach(l => {
    l.model = l.score <= 2 ? 'gemini-1.5-pro' : 'gemini-2.5-pro';
  });
}
const complexity = routed?.complexity === 'trivial' ? 'trivial' : 'standard'

const requestLower = request.toLowerCase();
const hasUiLane = lanes.some(l => ['atl-front', 'atl-ux', 'atl-brand'].includes(l.profile));
const isUiTask = hasUiLane || ['front', 'ui', 'botón', 'visual', 'pantalla', 'componente', 'css', 'html', 'diseño', 'login', 'layout', 'glassmorphism'].some(k => requestLower.includes(k));

let finalRequest = request;
if (isUiTask) {
  log('Oráculo', 'Se ha detectado un requerimiento de UI/UX. Consultando el Engram...', colors.fgMagenta);
  let engramRules = '';
  const engramPath = path.join(process.cwd(), 'integrations/antigravity/engram/knowledge_base.md');
  if (fs.existsSync(engramPath)) {
    try {
      const engramData = fs.readFileSync(engramPath, 'utf8');
      engramRules = engramData.split('## 🎨 Sistema de Diseño Estándar')[1]?.split('## 📚 Lecciones Aprendidas')[0] || '';
    } catch (err) {
      log('Oráculo', `Error al leer el Engram: ${err.message}`, colors.fgRed);
    }
  }

  log('Oráculo', 'Invocando al optimizador de prompts [agent-ui-enhancer] (Prompt Enhancer)...', colors.fgCyan);
  try {
    const systemInstruction = `Sos agent-ui-enhancer, el optimizador de prompts de Atlantis. 
    Tu tarea es expandir una petición de UI simple en una especificación premium con variables HSL, fuentes modernas, transiciones y estructura semántica basada en el Engram que se te provee. 
    Devuelve solo la especificación de diseño y el prompt expandido detallado.`;
    
    const prompt = `Petición original: "${request}"\n\nDirectrices de diseño del Engram:\n${engramRules}`;
    
    const enhancedResponse = await agent(
      `${systemInstruction}\n\n${prompt}`,
      { label: 'ui-enhancer', phase: 'Oráculo', effort: 'low', model: usePaidModels ? 'gemini-1.5-pro' : (useFreeModels ? 'gemini-1.5-flash' : undefined) }
    );
    if (enhancedResponse) {
      finalRequest = enhancedResponse.trim();
      log('Oráculo', 'Prompt optimizado generado con éxito por el modelo.', colors.fgGreen);
    }
  } catch (err) {
    log('Oráculo', `Error al llamar al Enhancer: ${err.message}. Usando petición original.`, colors.fgYellow);
  }
}

// Corriente rápida: petición trivial que mapea a ≤1 lane se resuelve directo — sin Heraldos,
// sin worktrees, sin Guardianes. Gate conservador: el Oráculo ya marcó standard ante
// cualquier roce de seguridad/datos o ≥2 lanes.
if (!dryRun && complexity === 'trivial' && lanes.length <= 1) {
  const lane = lanes[0]
  log(`Corriente rápida (trivial${lane ? `, lane única ${lane.profile}` : ', sin lane'}): resuelvo directo. ${routed?.note ?? ''}`)
  const answer = await agent(
    (lane ? `${lane.task}\n\nEspecificación de UI Enhancer:\n${finalRequest}\n\n(Petición original: ${request})\n\n` : `${finalRequest}\n\n`) +
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
const dispatched = await parallel(lanes.map(lane => () => {
  const taskPrompt = (['atl-front', 'atl-ux', 'atl-brand'].includes(lane.profile))
    ? `${lane.task}\n\nEspecificación de UI Enhancer:\n${finalRequest}`
    : lane.task;
  return agent(
    `${taskPrompt}\n\n(Petición original: ${request})\n\n${dryRun ? DRYRUN_PREAMBLE : PREAMBLE}`,
    { label: lane.profile, phase: 'Artesanos', agentType: lane.profile, ...(lane.model ? { model: lane.model } : {}) }
  ).then(out => ({ profile: lane.profile, task: lane.task, output: out, model: lane.model || null }))
}))

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
const GUARDS_INITIAL = GUARDS_CFG
  .filter(g => {
    if (g.always) return true;
    if (typeof g.when === 'function') return g.when(lanes);
    if (Array.isArray(g.when)) {
      const activeProfiles = new Set(lanes.map(l => l.profile));
      return g.when.some(p => activeProfiles.has(p));
    }
    return false;
  })
  .filter(g => !alreadyRouted.has(g.profile))
  .map(g => ({ ...g, model: useFreeModels ? 'gemini-1.5-flash' : (usePaidModels ? 'gemini-1.5-pro' : (g.model || 'gemini-1.5-pro')) }))

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
  ).then(out => ({ profile: g.profile, lens: g.lens, findings: out?.findings ?? [], clean: out?.clean ?? false, model: g.model || null }))
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
        { label: `juez:${b.guard}`, phase: 'Jueces', agentType: b.guard, effort: 'high', schema: VERDICT_SCHEMA, model: usePaidModels ? 'gemini-1.5-pro' : (useFreeModels ? 'gemini-1.5-flash' : undefined) }
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
  { label: 'decreto', phase: 'Decreto', effort: 'high', model: usePaidModels ? 'gemini-1.5-pro' : (useFreeModels ? 'gemini-1.5-flash' : undefined) }
)
log('Decreto emitido.')

// ACTUALIZACIÓN DINÁMICA DEL ENGRAM (Solo si no hay bloqueantes confirmados y es una tarea de UI)
if (!verifiedBlockers.length && isUiTask && !dryRun) {
  try {
    const engramPath = path.join(process.cwd(), 'integrations/antigravity/engram/knowledge_base.md');
    if (fs.existsSync(engramPath)) {
      let engramContent = fs.readFileSync(engramPath, 'utf8');
      
      const engramPrompt = `Analizá la salida del flujo de Atlantis y extraé una lección de diseño UI/UX corta (una sola frase en formato de viñeta, comenzando con '*   *(Aprendizaje de Flujo)*').
      Salida de artesanos:
      ${producido}
      
      Hallazgos del crítico:
      ${hallazgos}
      
      Generá solo la viñeta de lección aprendida, nada más.`;
      
      const lessonResult = await agent(engramPrompt, { label: 'engram-extractor', phase: 'Decreto', effort: 'low' });
      if (lessonResult && lessonResult.trim().startsWith('*')) {
        const splitContent = engramContent.split('## 📚 Lecciones Aprendidas (Evolución de Conocimiento)');
        if (splitContent.length === 2) {
          const updatedContent = `${splitContent[0]}## 📚 Lecciones Aprendidas (Evolución de Conocimiento)\n\n${lessonResult.trim()}\n${splitContent[1]}`;
          fs.writeFileSync(engramPath, updatedContent, 'utf8');
          log('Decreto', 'Base de conocimiento (Engram) actualizada exitosamente con nueva lección.', colors.fgGreen);
        }
      }
    }
  } catch (err) {
    log('Decreto', `Error al actualizar el Engram: ${err.message}`, colors.fgYellow);
  }
}

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
