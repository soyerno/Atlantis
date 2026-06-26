// ─────────────────────────────────────────────────────────────────────────────
// Atlantis · config de ejemplo (la FORMA del bloque CONFIG).
//
// IMPORTANTE: los scripts de Workflow corren sandboxeados (sin filesystem), así que
// Atlantis NO importa este archivo en runtime. Esto es la FORMA de la config:
// copiá este objeto al bloque `CONFIG` arriba de atlantis.mjs.
//
// Cada `profile` (Artesano) y cada `guard.profile` (Guardián) debe existir como
// agente en .claude/agents/.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // (1) ROSTER DE ARTESANOS — clave = nombre del agente, valor = qué cubre (una frase, la lee el Oráculo).
  //     Elegí granularidad por preocupación, no por archivo. Una feature suele cruzar varios.
  profiles: {
    'mi-front': 'frontend: componentes, páginas, interacción de cliente, navegación, bugs visuales/UI',
    'mi-back': 'backend: rutas API, dominio, adapters de persistencia, jobs, server actions',
    'mi-ux': 'usabilidad/a11y: simplificar flujo, touch targets, legibilidad, no abrumar',
    'mi-docs': 'documentación: guías, READMEs, specs, FAQ, changelog',
    'mi-security': 'seguridad: auth, control de acceso, rules, PII, secrets, prompt-injection',
    'mi-flow': 'integridad de flujos: un journey de varios pasos no se solapa, no repite lo ya pedido, no se contradice ni deja dead-ends',
  },

  // (2) GUARDIANES — corren tras los Artesanos, auditan lo producido, NO cambian código.
  //     always:true ⇒ siempre. when:(lanes)=>bool ⇒ condicional según qué se despachó.
  //     Si una lane ya fue ruteada a ese perfil, su Guardián no se re-corre (no duplica).
  guards: [
    { profile: 'mi-security', lens: 'SEGURIDAD', focus: 'auth, control de acceso, PII, secrets, deps/CVE', always: true },
    { profile: 'mi-docs', lens: 'DOCUMENTACIÓN', focus: 'lo que cambió quedó documentado; feature nueva sin spec; README desincronizado', always: true },
    // Condicional: solo si se tocó el front, auditar la integridad del journey.
    { profile: 'mi-flow', lens: 'INTEGRIDAD-FLUJO', focus: 'el journey no se solapa ni repite lo ya pedido, no se contradice, no deja dead-ends',
      when: (lanes) => lanes.some(l => ['mi-front'].includes(l.profile)) },
  ],

  // (2.b) JUECES (opcional) — roster de agentes que pesan cada 🔴 de un Guardián. Deben ser
  //       INDEPENDIENTES del Guardián acusador (un Juez nunca juzga su propio hallazgo). Si lo
  //       omitís, Atlantis usa los profiles de Artesanos/Guardianes disponibles, excluyendo al
  //       acusador. Dalo solo si querés fijar quiénes juzgan.
  // judges: ['mi-back', 'mi-security', 'mi-flow'],

  // (3) HERALDOS (opcional) — registro de arranque ANTES de despachar. null ⇒ se saltea.
  kickoff: {
    profile: 'mi-kickoff',
    instructions:
      '1. Listá los tickets primero (no dupliques); creá el card de esta iniciativa en "En curso" con label de área.\n' +
      '2. NO abras worktrees ni ramas: cada Artesano abre la suya. Indicá la convención de rama sugerida en la desc.\n' +
      '3. NO toques el cierre (Hecho/archive/roadmap). NO push/PR/merge.',
  },

  // (4) DISPATCH PREAMBLE (opcional) — disciplina de ejecución antepuesta a cada Artesano.
  dispatchPreamble:
    'EJECUCIÓN (sobreescribe el default del perfil):\n' +
    '- Si tu tarea es AUDITAR/reportar sin cambios de código: NO crees worktree ni PR. Devolvé el reporte (hallazgos, archivo:línea, severidad).\n' +
    '- Si tu tarea implica CAMBIOS de código:\n' +
    '  1. Creá tu worktree off origin/main fresco: git fetch origin && git worktree add <ruta-fuera-del-repo> -b <branch> origin/main. No pises branches de otras sesiones.\n' +
    '  2. Hacé los cambios; corré la validación del repo hasta verde.\n' +
    '  3. Commiteá en tu branch. NO abras PR — el humano revisa y abre los PRs.\n' +
    '  4. Reportá honesto: branch creada, archivos tocados, salida de validación, qué quedó pendiente.',

  // (5) MAREA BAJA / DRY-RUN (opcional) — para VERIFICAR la ciudad sin side-effects: saltea a los
  //     Heraldos y corre los Artesanos en modo-reporte (cero worktrees/ramas/commits/issues/cards).
  //     Mejor pasalo por args en la corrida puntual — { args: { request: '...', dryRun: true } } —
  //     y dejá esto en false. Ponelo true acá solo si querés que TODA corrida sea ensayo.
  dryRun: false,
}
