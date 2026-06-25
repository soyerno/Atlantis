---
name: "Orquestador Atlantis"
description: "Activa el flujo multi-agente de Atlantis (Oráculo, Artesanos, Guardianes, Jueces, Decreto) para procesar requerimientos de software complejos."
---

# Instrucciones de la Skill Atlantis

Cuando el usuario pida explícitamente ejecutar una tarea usando "Atlantis", "flujo Atlantis" o de forma implícita cuando detectes una petición de software compleja con múltiples frentes de desarrollo en este repositorio, debes asumir el rol del **Oráculo** y ejecutar las siguientes fases de la ciudad de agentes de Atlantis:

## Fase 1: El Oráculo (Ruteo, Complejidad y Selección de Modelo)
1. Analiza la petición del usuario y compárala contra el roster definido en `atlantis.config.json`.
2. Clasifica la complejidad de la tarea:
   - **Trivial:** Si la tarea es simple, autolimitada y requiere a lo sumo un artesano, puedes procesarla directamente o lanzar un solo artesano.
   - **Standard:** Si cruza múltiples áreas, involucra seguridad/autenticación o es de arquitectura, procede al flujo multi-agente completo.
3. Determina las "lanes" (carriles) de artesanos necesarios (ej. `agent-front`, `agent-back`, `agent-docs`, `agent-security`).
4. Realiza un scoring de dificultad de 1 a 5 para cada artesano:
   - **1-2:** Tareas de bajo riesgo, documentación o cambios de texto simples. Modelo recomendado: `gemini-1.5-flash` o `claude-3-5-haiku`.
   - **3-4:** Tareas lógicas estándar, frontend y backend intermedio. Modelo recomendado: `gemini-1.5-pro` o `claude-3-5-sonnet`.
   - **5:** Tareas críticas, seguridad, auth o cambios estructurales grandes. Modelo recomendado: `gemini-2.5-pro`, `gemini-1.5-pro-high-effort` o `claude-3-opus`.
5. **Confirmación del Usuario (Human-in-the-loop):** Antes de despachar a los Artesanos, presenta la propuesta en la terminal. El usuario podrá modificar las tareas, cambiar los modelos, agregar, eliminar o cancelar el ruteo.

## Fase 2: Los Heraldos (Opcional)
Si la configuración `kickoff` en `atlantis.config.json` no es nula, ejecuta la acción del Heraldo (ej. registrar un ticket local o una tarea de Git) antes de despachar a los Artesanos.

## Fase 3: Los Artesanos (Construcción en Paralelo)
1. Para cada lane seleccionada por el Oráculo, declara un subagente utilizando la herramienta `define_subagent`.
   - Asigna un nombre claro, como `atlantis-artesano-front` o `atlantis-artesano-back`.
   - Configura su `system_prompt` con el preámbulo de ejecución (`dispatchPreamble` de la configuración), su rol específico y el sub-pedido acotado.
   - Equípalo con herramientas de escritura (`enable_write_tools = true`).
2. Invoca a todos los Artesanos en paralelo mediante la herramienta `invoke_subagent` utilizando el modelo seleccionado y confirmado. Utiliza `Workspace = "share"` para que compartan el mismo repositorio pero trabajen de forma independiente si es posible, o `Workspace = "branch"` para aislar sus ramas de git.
3. Espera a que terminen sus tareas.

## Fase 4: Los Guardianes (Auditoría y Confirmación de Auditoría)
1. Revisa los archivos modificados por los Artesanos.
2. Identifica cuáles Guardianes de la lista `guards` en `atlantis.config.json` deben correr.
3. **Confirmación del Usuario:** Presenta los guardianes y sus modelos asignados en consola para confirmación interactiva. El usuario puede cambiar los modelos de auditoría o añadir/quitar guardianes.
4. Declara subagentes de tipo Guardián (ej. `atlantis-guardián-seguridad`) con permisos de lectura (`enable_write_tools = false`).
5. Invócalos en paralelo con los modelos confirmados para auditar el código producido. Cada guardián debe retornar un reporte estructurado indicando si está "limpio" o detallando "hallazgos" (archivo, línea, descripción y si es un bloqueante 🔴 o advertencia 🟡).

## Fase 5: Los tres Jueces (Resolución adversarial de Bloqueantes)
Si algún Guardián reporta un bloqueante 🔴:
1. Para cada bloqueante 🔴 reportado, inicializa a los tres Jueces: **Minos**, **Radamantis** y **Éaco** como subagentes separados.
2. Cada juez debe evaluar el bloqueante de forma independiente y emitir su voto (Confirmar Bloqueante o Desestimar/Advertencia).
3. Un bloqueante 🔴 solo sobrevive en el reporte final si obtiene la mayoría de los votos (2 de 3). De lo contrario, se degrada a advertencia 🟡 o se descarta.

## Fase 6: El Decreto (Veredicto Final)
Funde las salidas de los Artesanos, las auditorías de los Guardianes y las decisiones de los Jueces en un único reporte estructurado en Markdown (el "Decreto") con la siguiente estructura:
- **Resultado general:** ✅ ÉXITO (Sin bloqueantes) o 🔴 BLOQUEADO (Con bloqueantes activos).
- **Detalle de lanes resueltas:** Qué hizo cada artesano, su rama/worktree y estado.
- **Hallazgos de auditoría confirmados:** Lista de 🔴 bloqueantes aprobados por el tribunal y 🟡 advertencias.
- **Próximos pasos recomendados** para el humano.
