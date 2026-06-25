// ─────────────────────────────────────────────────────────────────────────────
// Pecera · config REAL de Firulapp (caso de estudio).
//
// Es el roster `firu-*` que vive en Firulapp/.claude/agents/, transcripto a la forma
// de config de la pecera. Reproduce el ROSTER y los GUARDIANES del route-request.mjs
// original de Firulapp (el motor de la pecera además suma fast-path + síntesis, que el
// original ganó vía la propuesta add-pecera-synth). Pegá el objeto al bloque CONFIG.
//
// 20 perfiles ruteables, 3 guardianes always-on, 3 condicionales-por-feature, 1 condicional-por-front.
// (firu-cyber es guardián, no perfil ruteable — igual que en el original.)
// ─────────────────────────────────────────────────────────────────────────────

export default {
  profiles: {
    // Producto / planeo
    'firu-po': 'product owner: priorizar backlog contra el North Star (WALM), change proposal OpenSpec antes de codear, criterios Given/When/Then, scope in/out',
    // Construcción
    'firu-front': 'frontend: componentes React, páginas, interacción de cliente, navegación, bugs visuales/UI',
    'firu-back': 'backend: rutas API, dominio, adapters de persistencia (Firestore/JSON), jobs, server actions',
    'firu-ux': 'usabilidad/a11y: simplificar flujo, touch targets, legibilidad, no abrumar (usuario 40+)',
    'firu-flow': 'integridad de flujos: un journey de varios pasos no se solapa, no repite lo ya pedido/derivable, no se contradice ni deja dead-ends',
    'firu-branding': 'design system: fidelidad de marca, tokens, identidad visual, assets/flyers, guardián de brand-drift',
    'firu-marketing': 'growth: SEO/GEO, campañas, leads/ads, sponsored, outbound a redes, copy para captar',
    'firu-docs': 'documentación: guías, READMEs, specs OpenSpec, artículos evergreen, FAQ, llms.txt, PENDIENTES',
    'firu-data': 'analytics: tracking de eventos, métricas/OKR/KPI, dashboards, consent y PII',
    'firu-release': 'release/CI-CD: semantic-release on-merge, Conventional Commits, harness pre-commit, deploy App Hosting',
    'firu-mobile': 'mobile/Capacitor: app Android/iOS, deep links, plugins nativos, bugs solo-en-WebView',
    'firu-qa': 'QA: estrategia de prueba, suite e2e Playwright como guard del MVP, regresión del flujo crítico',
    'firu-regression': 'regresión: catálogo organizado de bugs ya arreglados, cada uno atado a un test guardián; señala huecos',
    // Salida a prod / áreas de empresa
    'firu-launch': 'release captain: GO/NO-GO a prod, rampa del flag OFF→ON (dogfood/canary/100%), checklist pre-prod, runbook de rollback',
    'firu-legal': 'legal/compliance: privacidad, Términos, consentimiento, retención/borrado, Ley 25.326, pagos, UGC y menores',
    'firu-trust-safety': 'trust & safety: política de contenido/abuso (reportes falsos, scam, maltrato, acoso, spam) y cómo se modera',
    // Guardianes de integridad del producto (firu-cyber NO va acá: es guardián, no perfil ruteable)
    'firu-security': 'firestore.rules, prompt-injection, SSRF, gating de acceso IA, PII',
    'firu-flags': 'contrato de feature flags: feature OFF ⇒ no se ve ni se alcanza nada; cablear o auditar gating',
    'firu-parity': 'paridad IA: Firu + MCP externos cubren toda funcionalidad; docs/FAQ en sync; catálogo tools.ts',
    'firu-perf': 'performance: velocidad de carga, peso del bundle inicial, TTI, cascada de fetches al montar, lazy-load/code-splitting',
  },

  guards: [
    // Siempre-on: seguridad (defensivo + ofensivo) y documentación.
    { profile: 'firu-security', lens: 'SEGURIDAD-DEFENSIVO', focus: 'firestore.rules, prompt-injection, gating IA, PII, secrets/deps/CVE, headers/CSP', always: true },
    { profile: 'firu-cyber', lens: 'SEGURIDAD-OFENSIVO', focus: 'IDOR/BOLA, auth/ATO, control de acceso, SSRF/open-redirect activos, exploit-chaining', always: true },
    { profile: 'firu-docs', lens: 'DOCUMENTACIÓN', focus: 'funcionalidad de usuario sin guía/FAQ/artículo, feature nueva/breaking sin spec OpenSpec, README/llms.txt/PENDIENTES desactualizados', always: true },
    // Condicionales: si se tocó una feature de usuario, corren los gates pre-prod del contrato.
    { profile: 'firu-flags', lens: 'CONTRATO-FLAGS', focus: 'feature OFF ⇒ no se renderiza ni se alcanza NADA; las 4 capas gateadas; rutas/nav/deep-links/datos sembrados',
      when: (lanes) => lanes.some(l => ['firu-front', 'firu-back', 'firu-geo', 'firu-mcp', 'firu-mobile'].includes(l.profile)) },
    { profile: 'firu-parity', lens: 'PARIDAD-IA', focus: 'Firu + MCP externos cubren la funcionalidad nueva; docs/FAQ en sync; catálogo src/mcp/tools.ts',
      when: (lanes) => lanes.some(l => ['firu-front', 'firu-back', 'firu-geo', 'firu-mcp', 'firu-mobile'].includes(l.profile)) },
    { profile: 'firu-perf', lens: 'PERFORMANCE', focus: 'peso del bundle inicial, cascada de fetches al montar de vistas no visibles, SSR en serie, render que bloquea el primer paint',
      when: (lanes) => lanes.some(l => ['firu-front', 'firu-back', 'firu-geo', 'firu-mcp', 'firu-mobile'].includes(l.profile)) },
    // Condicional por front: integridad del journey.
    { profile: 'firu-flow', lens: 'INTEGRIDAD-FLUJO', focus: 'un journey de varios pasos no se solapa ni repite lo ya pedido (sobre-petición), no se contradice entre caminos, no deja dead-ends ni loops de redirect',
      when: (lanes) => lanes.some(l => ['firu-front', 'firu-mobile'].includes(l.profile)) },
  ],

  kickoff: {
    profile: 'firu-kickoff',
    instructions:
      '1. Trello: listá los cards primero (no dupliques); creá el card de esta iniciativa en "En curso" (o movélo desde Backlog) con label de área y desc (qué + estado "arrancado").\n' +
      '2. NO abras worktrees ni ramas vos: cada lane abre la suya. Indicá la convención de rama sugerida (feat/fix/chore-…) en la desc del card.\n' +
      '3. NO toques Hecho, archive ni ROADMAP (eso es firu-pm, el cierre). NO push/PR/merge.',
  },

  dispatchPreamble:
    'EJECUCIÓN (sobreescribe el default del perfil):\n' +
    '- Si tu tarea es AUDITAR/reportar sin cambios de código: NO crees worktree ni PR. Devolvé el reporte (hallazgos, archivo:línea, severidad) y sumá lo no-resuelto a docs/PENDIENTES.md.\n' +
    '- Si tu tarea implica CAMBIOS de código:\n' +
    '  1. Creá tu propio worktree off origin/main fresco: git fetch origin && git worktree add <ruta-fuera-del-repo> -b <branch> origin/main. No pises branches de otras sesiones.\n' +
    '  2. Hacé los cambios; corré "npm run validate" hasta verde.\n' +
    '  3. Commiteá en tu branch. NO abras PR — el usuario revisa y abre los PRs.\n' +
    '  4. Reportá honesto: branch creada, archivos tocados, salida de validate, qué quedó pendiente.',
}
