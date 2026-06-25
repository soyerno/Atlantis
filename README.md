# 🐟 Pecera

**Un orquestador multi-agente config-driven para Claude Code.** Un único punto de entrada toma un pedido en lenguaje natural, lo rutea al/los agente(s) experto(s) que correspondan, los corre en paralelo (cada uno aislado), pasa el resultado por guardianes siempre-on con verificación adversarial, y funde todo en **un** veredicto.

Es el patrón que Sakana AI productizó como **Fugu** (orquestador → pool intercambiable de expertos → verificación), pero como una pieza chica, sin servidor, que vive dentro de tu repo y corre con la herramienta `Workflow` de Claude Code.

> 🇬🇧 English version: [README.en.md](./README.en.md)

> Nació adentro de **Firulapp** (una app de comunidad para dueños de mascotas) como el ruteador de su roster de agentes `firu-*`. Este repo lo extrae a una herramienta **portable y agnóstica del proyecto**: vos traés el roster y los guardianes en un archivo de config; la pecera trae la maquinaria.

---

## Requisitos

- **Claude Code** con la herramienta `Workflow` disponible.
- Uno o más **subagentes** definidos en `.claude/agents/` de tu repo. Cada `profile` y cada `guard.profile` de tu config debe existir como un agente ahí. Ver [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) para la forma de un agente.
- Nada de servidores, dependencias ni build. La pecera es **un solo archivo** (`route-request.mjs`) que corrés con el `Workflow`.

---

## Los cuatro trabajos

```
        pedido (string)
            │
   ┌────────▼─────────┐
   │  1. CLASIFICAR   │  un router LLM parte el pedido en "lanes" (una por perfil)
   │                  │  + clasifica complejidad (trivial → fast-path)
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  2. DESPACHAR    │  un agente por lane, EN PARALELO, cada uno aislado
   │                  │  (worktree propio si toca código)
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  3. CUSTODIAR    │  guardianes SIEMPRE-ON auditan lo despachado
   │                  │  (seguridad, docs, …) — red de seguridad, no opcional
   │                  │  ↳ cada 🔴 pasa por escépticos adversariales:
   │                  │    sobrevive solo si la mayoría lo confirma
   └────────┬─────────┘
            │
   ┌────────▼─────────┐
   │  4. SINTETIZAR   │  funde lanes + hallazgos VERIFICADOS en UN veredicto:
   │                  │  ✅ hecho · 🔴 bloqueante · 🟡 pendiente · → próximo paso
   └──────────────────┘
```

Tres atajos hacen que no pagues la maquinaria completa cuando no hace falta:

- **Fast-path trivial.** Si el router marca el pedido como trivial y mapea a ≤1 lane, se resuelve en línea: sin registro, sin worktrees, sin guardianes.
- **Guardianes condicionales.** Algunos guardianes corren siempre; otros solo si una lane tocó cierto tipo de trabajo (ej.: tocaste front ⇒ corre el guardián de flujos).
- **Verificación adversarial de bloqueantes.** Un guardián de una sola voz puede sobre-severizar o alucinar un 🔴 que frena al humano. Antes de sintetizar, cada 🔴 pasa por 2-3 escépticos independientes (lentes repro/autoridad/severidad) que intentan refutarlo; sobrevive solo por mayoría. Los 🟡/⚪ no pagan esto, y sin ningún 🔴 la fase se saltea entera (cero costo extra).

## Por qué importa (la idea de fondo)

La ventana de contexto es memoria de trabajo. Un solo agente que hace todo se satura, deriva de personaje y mezcla preocupaciones. La pecera **reparte el trabajo entre especialistas con contexto fresco cada uno** y reconcilia al final — más parecido a cómo trabaja un equipo que a un prompt gigante. El humano sigue siendo quien decide lo irreversible (mergear, deployar, publicar): la pecera prepara y reconcilia, no manda a producción.

### ¿Por qué no orquestar a mano con Claude Code?

Claude Code ya trae los ladrillos: subagentes (la tool `Task`/`Agent`) y la tool `Workflow` para fan-out determinístico. La pecera **no los reemplaza, los usa** — es una receta opinada encima:

| | Subagente suelto (`Task`) | `Workflow` crudo | **Pecera** |
|---|---|---|---|
| Decide **qué** experto toma el pedido | vos, a mano | vos, en el script | un **router LLM** según tu roster |
| Corre varios en paralelo | no (uno por llamada) | sí, vos lo cableás | sí, **una lane por perfil** |
| Red de seguridad post-trabajo | no | la que escribas | **guardianes always-on + condicionales** |
| Frena falsos 🔴 | no | no | **verificación adversarial** (2-3 escépticos, mayoría) |
| Reconcilia todo en un veredicto | no | la que escribas | **fase de síntesis** estructurada |
| Configurable por proyecto | — | reescribís el script | **un bloque `CONFIG`**, el motor no se toca |

Regla simple: si es **un** experto y **una** tarea, llamá un subagente y listo. La pecera gana cuando el pedido **cruza varias preocupaciones** y querés que algo **audite y reconcilie** lo que produjeron — sin reescribir la orquestación cada vez.

---

## Uso

1. **Cloná** este repo (o copiá `route-request.mjs` a tu repo).
2. **Definí tu roster** editando el bloque `CONFIG` arriba de [`route-request.mjs`](./route-request.mjs). Los scripts de `Workflow` corren sandboxeados (sin acceso a filesystem), así que la config **vive inline** en el script, no en un archivo aparte que se importe. [`pecera.config.example.mjs`](./pecera.config.example.mjs) es la *forma* a pegar ahí. Tenés que tener los agentes correspondientes en `.claude/agents/`.
3. **Corré el orquestador** con la herramienta `Workflow` de Claude Code, pasando tu pedido como `args`:

```js
Workflow({
  scriptPath: 'route-request.mjs',
  args: 'arreglá el botón de volver del mapa',
})
```

El script rutea, despacha y sintetiza según tu `CONFIG`. El struct de retorno trae `{ request, dryRun, complexity, lanes, results, guards, verifiedBlockers, refutedBlockers, synthesis }`.

### Dry-run (verificar sin side-effects)

Para **probar el orquestador sin que haga nada real** — útil cuando iterás el ruteo o los prompts — pasá `dryRun`:

```js
Workflow({ scriptPath: 'route-request.mjs', args: { request: 'tu pedido', dryRun: true } })
```

Con `dryRun`: se saltea el `kickoff` (no crea card/issue) y las lanes corren en **modo-reporte** (sin worktrees, ramas, commits, issues ni cards) — solo dicen qué *harían*. Sin esto, correr el orquestador para testear dispara el pipeline **real**: crea tickets, ramas y commits de verdad.

### Anatomía de la config (el bloque `CONFIG`)

```js
export default {
  // (1) Roster: clave = nombre del agente en .claude/agents/, valor = qué cubre.
  profiles: {
    'mi-front':  'frontend: componentes, navegación, bugs visuales',
    'mi-back':   'backend: rutas API, dominio, persistencia',
    'mi-docs':   'documentación: guías, READMEs, specs',
    'mi-sec':    'seguridad: auth, rules, PII, prompt-injection',
  },

  // (2) Guardianes: corren DESPUÉS de despachar, auditan lo producido.
  guards: [
    // always: true ⇒ corre siempre. when: (lanes) => bool ⇒ corre condicional.
    { profile: 'mi-sec',  lens: 'SEGURIDAD', focus: 'auth, rules, PII', always: true },
    { profile: 'mi-docs', lens: 'DOCS',      focus: 'lo que cambió quedó documentado', always: true },
    { profile: 'mi-flow', lens: 'FLUJO',     focus: 'el journey no se contradice',
      when: (lanes) => lanes.some(l => l.profile === 'mi-front') },
  ],

  // (3) Opcional: un agente de "registro de arranque" (card de ticket, etc.) antes de despachar.
  kickoff: { profile: 'mi-kickoff', instructions: 'creá el card en "En curso" y la convención de rama' },

  // (4) Opcional: instrucciones de ejecución que se anteponen a cada lane (disciplina de tu repo).
  dispatchPreamble: 'Si tu tarea implica código: worktree off origin/main fresco, validá verde, commiteá en branch, NO abras PR.',
}
```

Todo lo demás (fast-path, paralelismo, verificación adversarial, struct de retorno, prompts del router/sintetizador) lo trae la pecera. Si no definís `guards`, no corre ninguno. Si no definís `kickoff`, se saltea el registro.

---

## Estructura

| Archivo | Qué es |
|---|---|
| [`route-request.mjs`](./route-request.mjs) | El orquestador generalizado. No tocar para usarlo — se configura por afuera. |
| [`pecera.config.example.mjs`](./pecera.config.example.mjs) | Config de ejemplo comentada. Copiá el objeto al bloque `CONFIG`. |
| [`examples/firulapp.config.mjs`](./examples/firulapp.config.mjs) | Un roster real (20+ perfiles ruteables + guardianes) como caso de estudio. |
| [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) | La forma de un agente de `.claude/agents/`, como referencia. |

## Créditos

Patrón inspirado en **Fugu** (Sakana AI, 2026). Implementación y generalización: el roster de agentes de Firulapp. Licencia [MIT](./LICENSE).
