---
name: "Orquestador Atlantis"
description: "Activa el flujo multi-agente de Atlantis (Oráculo, Artesanos, Guardianes, Jueces, Decreto) para procesar requerimientos de software complejos."
---

# Instrucciones de la Skill Atlantis

Cuando el usuario pida ejecutar una tarea de desarrollo o diseño usando "Atlantis", "flujo Atlantis" o al detectar peticiones de software complejas en este repositorio, debes asumir el rol del **Oráculo** y orquestar las fases de la ciudad de agentes de Atlantis:

## Fase 1: El Oráculo (Ruteo, Interpretación de UI y Engram)
1. **Consulta del Engram:** Si la tarea es de UI/diseño, lee el archivo de memoria `engram/knowledge_base.md` para conocer los patrones vigentes y lecciones anteriores.
2. **Optimizador de Prompts (Prompt Enhancer):** Invoca a un subagente transitorio `agent-ui-enhancer` para interpretar la solicitud básica de UI y expandirla en una especificación premium con variables HSL, fuentes modernas, transiciones y estructura semántica.
3. **Clasificación:** Analiza la propuesta técnica contra el roster en `atlantis.config.json` y clasifica la complejidad.
4. **Lanes:** Determina las lanes de desarrollo (ej. `agent-ui`, `agent-back`, `agent-docs`).

## Fase 2: Los Heraldos (Opcional)
Si la configuración `kickoff` no es nula, ejecuta la tarea inicial (ej. registrar la iniciativa en el proyecto) antes de despachar a los Artesanos.

## Fase 3: Los Artesanos (Construcción en Paralelo)
1. Para cada lane, declara un subagente con `define_subagent` (ej. `atlantis-artesano-ui`, `atlantis-artesano-back`).
2. Configura su prompt de sistema. Si es un artesano de UI, inyéctale la especificación detallada producida por el Prompt Enhancer y las directrices vigentes del Engram.
3. Invócalos en paralelo con `Workspace = "share"` o `"branch"`. Espera sus resultados.

## Fase 4: Los Guardianes (Auditoría Estética y "Abogado del Diablo")
1. Revisa los archivos modificados por los Artesanos.
2. Identifica los Guardianes que deben auditar el código. Si hubo cambios visuales, activa al `agent-ui-critic` como el **Abogado del Diablo**.
3. Declara subagentes de tipo Guardián (solo lectura, `enable_write_tools = false`) e invócalos para verificar la calidad.
4. El guardián de UI buscará defectos de UX, contraste, fuentes, ausencia de animaciones suaves, SEO o IDs faltantes, y reportará bloqueantes 🔴 y advertencias 🟡.

## Fase 5: Los tres Jueces (Resolución adversarial de Bloqueantes)
Si algún Guardián (incluido el Abogado del Diablo) reporta un bloqueante 🔴:
1. Inicializa a los tres Jueces: **Minos**, **Radamantis** y **Éaco** como subagentes independientes.
2. Cada juez evalúa adversarialmente el bloqueante UI o técnico.
3. Un bloqueante 🔴 solo sobrevive si obtiene la mayoría de los votos (2 de 3); de lo contrario, se degrada a advertencia 🟡.

## Fase 6: El Decreto y Evolución de Memoria (Engram)
1. Genera el reporte final en Markdown (el "Decreto") detallando:
   - Estado general: ✅ ÉXITO o 🔴 BLOQUEADO.
   - Resumen del Prompt Mejorado.
   - Detalle de lanes resueltas e inspección del Abogado del Diablo.
   - Hallazgos confirmados por el tribunal.
2. **Actualización del Engram:** Si se identificaron nuevos errores estéticos corregidos o patrones útiles de UI, escribe estos aprendizajes directamente en `engram/knowledge_base.md` en la sección de "Lecciones Aprendidas". Así la ciudad incrementa su sabiduría.
