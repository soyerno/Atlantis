<p align="center">
  <img src="./assets/atlantis-banner.svg" alt="Atlantis — la ciudad-orquestadora de agentes para Claude Code" width="100%">
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-E8B84B?style=flat-square"></a>
  <img alt="Built for Claude Code" src="https://img.shields.io/badge/Claude%20Code-Workflow-0E3A4C?style=flat-square">
  <img alt="Node ≥ 18" src="https://img.shields.io/badge/Node-%E2%89%A5%2018-126E82?style=flat-square">
  <img alt="Zero dependencies" src="https://img.shields.io/badge/deps-0-1FA8A0?style=flat-square">
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/lang-EN-C2922B?style=flat-square"></a>
</p>

<p align="center"><b>Una petición en lenguaje natural entra a la ciudad. Sale un solo Decreto.</b><br>
Un orquestador multi-agente <i>config-driven</i> para Claude Code — en un solo archivo, sin servidor, sin dependencias.</p>

---

## Qué dolor resuelve

Un solo agente que hace **todo** se satura: la ventana de contexto es memoria de trabajo, y cuando se llena el agente deriva de personaje, mezcla preocupaciones y se le cuelan errores que **nadie audita**. Y si querés repartir el trabajo entre varios agentes a mano, terminás reescribiendo el ruteo, el paralelismo y la verificación **en cada proyecto**.

## Para qué

Para que un pedido se reparta entre **especialistas con contexto fresco**, se **audite** con guardianes siempre-on, se **filtren los falsos bloqueantes** con un juicio adversarial, y todo se **reconcilie en un veredicto** — configurando un solo bloque, sin tocar el motor. El humano sigue decidiendo lo irreversible (mergear, deployar, publicar): Atlantis prepara y reconcilia, no manda a producción.

## Cómo

Seis actos, cada uno con su nombre y su oficio. Config-driven; corre con la herramienta `Workflow` de Claude Code.

<p align="center">
  <img src="./assets/architecture.svg" alt="Los seis actos de Atlantis" width="640">
</p>

| Acto | En la ciudad | Lo que hace de verdad |
|---|---|---|
| 1 · **El Oráculo** | lee la petición | un router LLM la reparte en *lanes* por experto + clasifica complejidad (trivial → corriente rápida) |
| 2 · **Los Heraldos** | anuncian | *(opcional)* registran la iniciativa (ticket/card) antes de despachar |
| 3 · **Los Artesanos** | construyen | un agente experto por lane, en paralelo, cada uno aislado en su worktree |
| 4 · **Los Guardianes** | vigilan | auditan lo despachado — siempre-on + condicionales. No tocan código |
| 5 · **Los tres Jueces** | sentencian | **Minos · Radamantis · Éaco** pesan cada 🔴; sobrevive solo por mayoría |
| 6 · **El Decreto** | proclama | funde todo en un veredicto: ✅ hecho · 🔴 bloqueante · 🟡 pendiente · → próximo paso |

### Tres corrientes para no pagar de más

- **Corriente rápida.** Si el Oráculo marca la petición como trivial y mapea a ≤1 lane, se resuelve en línea: sin Heraldos, sin worktrees, sin Guardianes.
- **Marea baja (dry-run).** Para probar la ciudad sin que haga nada real: los Artesanos corren en modo-reporte (cero worktrees/ramas/commits/issues) y solo dicen qué *harían*.
- **El juicio de los Jueces.** Un Guardián de una sola voz puede sobre-severizar o alucinar un 🔴 que frena al humano. Antes del Decreto, cada 🔴 pasa por los tres Jueces (lentes repro/autoridad/severidad) que intentan refutarlo; sobrevive solo por mayoría. Los 🟡/⚪ no pagan esto, y sin ningún 🔴 el acto se saltea entero.

---

## Requisitos y Compatibilidad

### A. Claude Code (Original)
- **Claude Code** con la herramienta `Workflow` disponible.
- Uno o más **subagentes** (los Artesanos) definidos en `.claude/agents/`. Cada `profile` y cada `guard.profile` de tu config debe existir como un agente ahí — ver [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) para la forma.
- Nada de servidores, dependencias ni build. Atlantis es **un solo archivo** (`atlantis.mjs`).

### B. Gemini / Antigravity (Soporte Nativo)
Atlantis también es compatible de forma nativa con el ecosistema de **Antigravity (Gemini)**, utilizando su sistema de **Personalizaciones (Skills)** y la orquestación paralela de subagentes.
- **Entorno Antigravity** activo.
- Configuración de la skill local detallada en [`integrations/antigravity/`](./integrations/antigravity/).

## Uso

### Con Claude Code


1. **Cloná** este repo (o copiá `atlantis.mjs` a tu repo).
2. **Definí tu roster** editando el bloque `CONFIG` arriba de [`atlantis.mjs`](./atlantis.mjs). Los scripts de `Workflow` corren sandboxeados (sin filesystem), así que la config **vive inline** en el script. [`atlantis.config.example.mjs`](./atlantis.config.example.mjs) es la *forma* a pegar ahí.
3. **Corré la ciudad** con la herramienta `Workflow`, pasando tu petición como `args`:

```js
Workflow({ scriptPath: 'atlantis.mjs', args: 'arreglá el botón de volver del mapa' })
```

El struct de retorno trae `{ request, dryRun, complexity, lanes, results, guards, verifiedBlockers, refutedBlockers, synthesis }`.

**Marea baja** (verificar sin side-effects):

```js
Workflow({ scriptPath: 'atlantis.mjs', args: { request: 'tu pedido', dryRun: true } })
```

### Anatomía de la config

```js
const CONFIG = {
  // (1) Artesanos: clave = nombre del agente en .claude/agents/, valor = qué cubre.
  profiles: {
    'mi-front': 'frontend: componentes, navegación, bugs visuales',
    'mi-back':  'backend: rutas API, dominio, persistencia',
    'mi-docs':  'documentación: guías, READMEs, specs',
    'mi-sec':   'seguridad: auth, rules, PII, prompt-injection',
  },
  // (2) Guardianes: corren DESPUÉS de los Artesanos, auditan lo producido.
  guards: [
    { profile: 'mi-sec',  lens: 'SEGURIDAD', focus: 'auth, rules, PII', always: true },
    { profile: 'mi-flow', lens: 'FLUJO',     focus: 'el journey no se contradice',
      when: (lanes) => lanes.some(l => l.profile === 'mi-front') },
  ],
  // (3) Opcional: Heraldos (registro de arranque) antes de despachar.
  kickoff: { profile: 'mi-kickoff', instructions: 'creá el card y la convención de rama' },
  // (4) Opcional: disciplina de ejecución antepuesta a cada Artesano.
  dispatchPreamble: 'Si tocás código: worktree off origin/main fresco, validá verde, commiteá en branch, NO abras PR.',
}
```

Todo lo demás (corriente rápida, paralelismo, juicio adversarial, prompts del Oráculo/Decreto) lo trae Atlantis. Forma completa y comentada en [`atlantis.config.example.mjs`](./atlantis.config.example.mjs); un roster real de 14 Artesanos en [`examples/example.config.mjs`](./examples/example.config.mjs).

### Con Gemini / Antigravity

1. Copia la carpeta `.agents/` a la raíz de tu proyecto.
2. Configura tu roster en `integrations/antigravity/atlantis.config.json`.
3. Pídele al agente en la ventana de chat: *"Usa Atlantis para [tu requerimiento]"*.
4. Si deseas correr el simulador CLI local en tu terminal, ejecuta:
   ```bash
   node integrations/antigravity/atlantis-harness-gemini.mjs "Tu petición de desarrollo"
   ```

---

## ¿Por qué no orquestar a mano?

Claude Code ya trae los ladrillos: subagentes (la tool `Task`/`Agent`) y la tool `Workflow` para fan-out determinístico. Atlantis **no los reemplaza, los usa** — es una receta opinada encima:

| | Subagente suelto (`Task`) | `Workflow` crudo | **Atlantis** |
|---|---|---|---|
| Decide **qué** experto toma el pedido | vos, a mano | vos, en el script | **el Oráculo** según tu roster |
| Corre varios en paralelo | no | sí, vos lo cableás | sí, **un Artesano por lane** |
| Red de seguridad post-trabajo | no | la que escribas | **Guardianes always-on + condicionales** |
| Frena falsos 🔴 | no | no | **los tres Jueces** (mayoría) |
| Reconcilia en un veredicto | no | la que escribas | **el Decreto** |
| Configurable por proyecto | — | reescribís el script | **un bloque `CONFIG`** |

Regla simple: si es **un** experto y **una** tarea, llamá un subagente y listo. Atlantis gana cuando el pedido **cruza varias preocupaciones** y querés que algo **audite y reconcilie** lo que produjeron — sin reescribir la orquestación cada vez.

---

## Atlantis en Slack

Atlantis puede **vivir en Slack** como un colaborador más: le hablás en un canal o hilo, dispara la ciudad, y el Decreto vuelve al hilo. Una respuesta en el mismo hilo **continúa la tarea** con el contexto vivo. Ver [`slack/`](./slack/) para el puente bidireccional y el reporte diario.

> **Límite de privacidad (por diseño).** El Atlantis-de-Slack solo ve lo que se dice **en Slack**, más sus propios **reportes diarios** programados. Nunca observa ni refleja el trabajo de tu entorno local o de desarrollo: lo que pasa en tu máquina se queda en tu máquina. El agente se comporta como si **viviera en Slack** — no como un espejo de tu terminal.

---

## Estructura

| Archivo | Qué es |
|---|---|
| [`atlantis.mjs`](./atlantis.mjs) | El orquestador. No se toca para usarlo — se configura por afuera. |
| [`atlantis.config.example.mjs`](./atlantis.config.example.mjs) | Config de ejemplo comentada (la forma del bloque `CONFIG`). |
| [`examples/example.config.mjs`](./examples/example.config.mjs) | Un roster real (14 Artesanos + Guardianes) como caso de estudio. |
| [`examples/agents/agent-docs.md`](./examples/agents/agent-docs.md) | La forma de un agente de `.claude/agents/`. |
| [`integrations/antigravity/`](./integrations/antigravity/) | Configuración y harness para la compatibilidad con Gemini Antigravity. |
| [`slack/`](./slack/) | El puente bidireccional con Slack + el reporte diario. |
| [`assets/`](./assets/) | Identidad visual (banner, logo, diagrama). |

## Contribuir

Issues y PRs bienvenidos. Mantené el motor **agnóstico del proyecto** (toda la especificidad vive en el `CONFIG` del usuario) y respetá la voz de la ciudad. Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Créditos y licencia

El patrón **orquestador → pool intercambiable de expertos → verificación** lo productizó Sakana AI como **Fugu** (2026); Atlantis lo lleva a una pieza chica, sin servidor, que vive dentro de tu repo. Licencia [MIT](./LICENSE).

<p align="center"><sub>🔱 Atlantis · una petición entra, un Decreto sale.</sub></p>
