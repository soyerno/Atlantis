// ─────────────────────────────────────────────────────────────────────────────
// Atlantis · config de ejemplo de un roster real (caso de estudio).
//
// Un roster de Artesanos y Guardianes para una app web de producto (web + mobile),
// transcripto a la forma de config de Atlantis. Pegá el objeto al bloque CONFIG de
// atlantis.mjs. Cada `profile` y cada `guard.profile` debe existir como agente en
// .claude/agents/.
//
// 14 Artesanos ruteables · 2 Guardianes always-on · 2 condicionales-por-front.
// (Los profiles `security` y `flags` son SOLO-Guardián: auditan, no se rutean como Artesanos —
//  no están en `profiles`, solo en `guards`. El lens de `security` es DEFENSIVO, no ofensivo.)
// ─────────────────────────────────────────────────────────────────────────────

export default {
  profiles: {
    // Producto / planeo
    'po': 'product owner: prioriza el backlog contra el North Star, escribe la propuesta antes de codear, criterios de aceptación, scope in/out',
    // Construcción
    'front': 'frontend: componentes, páginas, interacción de cliente, navegación, bugs visuales/UI',
    'back': 'backend: rutas API, dominio, adapters de persistencia, jobs, server actions',
    'ux': 'usabilidad/a11y: simplificar el flujo, touch targets, legibilidad, no abrumar',
    'flow': 'integridad de flujos: un journey de varios pasos no se solapa, no repite lo ya pedido, no se contradice ni deja dead-ends',
    'branding': 'design system: fidelidad de marca, tokens, identidad visual, guardián de brand-drift',
    'docs': 'documentación: guías, READMEs, specs, artículos evergreen, FAQ, changelog',
    'data': 'analytics: tracking de eventos, métricas/KPI, dashboards, consent y PII',
    'release': 'release/CI-CD: versionado on-merge, conventional commits, harness pre-commit, deploy',
    'mobile': 'mobile: app nativa, deep links, plugins, bugs solo-en-WebView',
    'qa': 'QA: estrategia de prueba, suite e2e como guard del MVP, regresión del flujo crítico',
    'perf': 'performance: tiempo de carga, peso del bundle inicial, TTI, cascada de fetches al montar',
    // Salida a prod
    'launch': 'release captain: GO/NO-GO a prod, rampa del flag OFF→ON, checklist pre-prod, runbook de rollback',
    'legal': 'legal/compliance: privacidad, términos, consentimiento, retención/borrado, pagos, UGC y menores',
  },

  guards: [
    // Siempre-on: seguridad y documentación.
    { profile: 'security', lens: 'SEGURIDAD-DEFENSIVO', focus: 'rules de acceso, prompt-injection, gating, PII, secrets/deps/CVE, headers/CSP', always: true },
    { profile: 'docs', lens: 'DOCUMENTACIÓN', focus: 'funcionalidad de usuario sin guía/FAQ, feature nueva/breaking sin spec, README desactualizado', always: true },
    // Condicionales: si se tocó el front, corren los gates de contrato pre-prod.
    { profile: 'flags', lens: 'CONTRATO-FLAGS', focus: 'feature OFF ⇒ no se renderiza ni se alcanza NADA; las capas gateadas; rutas/nav/deep-links/datos sembrados',
      when: (lanes) => lanes.some(l => ['front', 'back', 'mobile'].includes(l.profile)) },
    { profile: 'perf', lens: 'PERFORMANCE', focus: 'peso del bundle inicial, cascada de fetches al montar de vistas no visibles, render que bloquea el primer paint',
      when: (lanes) => lanes.some(l => ['front', 'back', 'mobile'].includes(l.profile)) },
  ],

  kickoff: {
    profile: 'kickoff',
    instructions:
      '1. Listá los tickets primero (no dupliques); creá el card de esta iniciativa en "En curso" con label de área y desc (qué + estado "arrancado").\n' +
      '2. NO abras worktrees ni ramas vos: cada Artesano abre la suya. Indicá la convención de rama sugerida (feat/fix/chore-…) en la desc.\n' +
      '3. NO toques el cierre (Hecho/archive/roadmap). NO push/PR/merge.',
  },

  dispatchPreamble:
    'EJECUCIÓN (sobreescribe el default del perfil):\n' +
    '- Si tu tarea es AUDITAR/reportar sin cambios de código: NO crees worktree ni PR. Devolvé el reporte (hallazgos, archivo:línea, severidad).\n' +
    '- Si tu tarea implica CAMBIOS de código:\n' +
    '  1. Creá tu propio worktree off origin/main fresco: git fetch origin && git worktree add <ruta-fuera-del-repo> -b <branch> origin/main. No pises branches de otras sesiones.\n' +
    '  2. Hacé los cambios; corré la validación del repo hasta verde.\n' +
    '  3. Commiteá en tu branch. NO abras PR — el humano revisa y abre los PRs.\n' +
    '  4. Reportá honesto: branch creada, archivos tocados, salida de validación, qué quedó pendiente.',
}
