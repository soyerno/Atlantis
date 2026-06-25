# Descripción del Pull Request (PR) · Integración con Gemini / Antigravity

## 1. Título Sugerido
`feat: agregar soporte nativo para el ecosistema Gemini / Antigravity y simulador local`

---

## 2. Resumen Ejecutivo
Este Pull Request introduce compatibilidad nativa con el ecosistema de **Antigravity (Gemini)** en el orquestador multi-agente **Atlantis**. A través de esta integración, Atlantis deja de ser una herramienta exclusiva de *Claude Code* para convertirse en una solución multiplataforma que aprovecha el sistema de **Personalizaciones (Skills)** de Antigravity.

### Cambios clave incluidos:
- **Estructura de Skill de Antigravity**: Implementación de `.agents/skills/atlantis/SKILL.md` para guiar a los agentes de Gemini en la ejecución secuencial y paralela de los 6 actos del orquestador.
- **Harness de Simulación Local**: Creación de un script interactivo en Node.js (`atlantis-harness-gemini.mjs`) que permite probar y validar localmente el flujo completo de Atlantis (Oráculo, Heraldos, Artesanos, Guardianes, Jueces y Decreto).
- **Esquema de Configuración Dedicado**: Introducción de un archivo JSON estructurado para definir perfiles de agentes, guardianes y preámbulos de ejecución (`atlantis.config.json`).
- **Actualización de Documentación**: Expansión del `README.md` para incluir requerimientos de compatibilidad y guías de uso tanto para Claude Code como para Antigravity.

---

## 3. Tabla Detallada de Cambios por Archivo

| Archivo | Tipo de Cambio | Líneas Agregadas/Modificadas | Propósito y Descripción Detallada |
| :--- | :--- | :---: | :--- |
| [`.agents/skills/atlantis/SKILL.md`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/.agents/skills/atlantis/SKILL.md) | **Creado** | +52 | Define la habilidad o *Skill* "Orquestador Atlantis" para Antigravity. Proporciona instrucciones detalladas en formato YAML y Markdown para guiar al agente de IA en las 6 fases: Oráculo (con puntuación de dificultad y asignación de modelos), Heraldos (kickoff), Artesanos (subagentes en paralelo), Guardianes (auditoría), Jueces (votación adversarial de bloqueantes) y Decreto (reporte de veredicto). |
| [`integrations/antigravity/atlantis-harness-gemini.mjs`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/integrations/antigravity/atlantis-harness-gemini.mjs) | **Creado** | +410 | Script ejecutable en Node.js que simula la interacción de consola de Atlantis. Implementa: <br>• Detección y ruteo automático por palabras clave.<br>• Interfaz de línea de comandos interactiva (`readline`) para confirmar, editar, agregar o eliminar *lanes* (Artesanos) y *guards* (Guardianes) en caliente (Human-in-the-loop).<br>• Simulación de auditoría con hallazgos simulados (bloqueantes y advertencias).<br>• Sistema de votación adversarial de los Tres Jueces (Minos, Radamantis, Éaco).<br>• Generación del reporte de "Decreto" en formato Markdown. |
| [`integrations/antigravity/atlantis.config.json`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/integrations/antigravity/atlantis.config.json) | **Creado** | +14 | Configuración estructurada en formato JSON para el entorno de Antigravity. Define los perfiles de Artesanos disponibles (`agent-front`, `agent-back`, `agent-docs`, `agent-security`), las reglas de auditoría activa para los Guardianes, el estado del kickoff y el preámbulo de despacho (`dispatchPreamble`) que instruye a los subagentes a trabajar con worktrees independientes. |
| [`README.md`](file:///C:/Users/Erno/.gemini/antigravity/scratch/Atlantis/README.md) | **Modificado** | +21 / -1 | Reestructura la documentación principal para dar cabida a la compatibilidad con Gemini. Separa los requisitos entre Claude Code (original) y Gemini / Antigravity, detalla el uso del nuevo harness de simulación en consola y actualiza la tabla de mapeo de archivos del proyecto. |

---

## 4. Instrucciones Paso a Paso de Cómo Probar la Integración

Para probar y verificar el correcto funcionamiento del flujo de simulación y la configuración del entorno Gemini, sigue estos pasos:

### Prerrequisitos:
- Asegúrate de tener instalado **Node.js** (versión 16 o superior).
- El directorio de trabajo debe ser la raíz del repositorio de Atlantis.

### Paso 1: Ejecutar una simulación estándar (Sin bloqueantes)
Ejecuta el harness simulando un requerimiento puramente de documentación:
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs "Actualizar el manual de usuario y guías de la API"
```
**Qué verificar:**
- El **Oráculo** detectará la palabra clave `guia` o `manual` y activará la lane `agent-docs` asignándole por defecto el modelo `gemini-1.5-flash` y un score de dificultad `2/5`.
- Se te presentará la propuesta de ruteo de Artesanos de forma interactiva en la terminal. Presiona `c` y luego Enter para confirmar.
- Pasarás a la propuesta de Guardianes. Presiona `c` y luego Enter.
- La simulación finalizará exitosamente mostrando el reporte del **Decreto** con estado **✅ APROBADO**.

### Paso 2: Ejecutar una simulación con bloqueantes de seguridad (Fase de Jueces)
Para probar la lógica de auditoría de seguridad y la toma de decisiones del tribunal de Jueces, corre una petición con la palabra clave "seguridad":
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs "Implementar autenticación de backend y validar la seguridad de la sesión"
```
**Qué verificar:**
- El **Oráculo** activará `agent-back` y `agent-security` con puntuaciones y modelos diferenciados (ej. `gemini-2.5-pro` para seguridad).
- Confirma los Artesanos presionando `c` y luego Enter.
- Confirma los Guardianes presionando `c` y luego Enter.
- En la fase de **Guardianes**, se reportará un hallazgo bloqueante 🔴 simulado en `src/auth/jwt.js` (el token expira en 365 días).
- Se activará automáticamente la **Fase de Jueces**. Observa en la terminal los votos de Minos, Radamantis y Éaco.
- Dado que es un bloqueante confirmado por mayoría, el resultado final será **🔴 DECRETO BLOQUEADO**, mostrando las advertencias y los pasos para corregirlo.

### Paso 3: Probar el modo Marea Baja (Dry-Run)
Verifica que las banderas de ejecución funcionen como se describe en la guía:
```bash
node integrations/antigravity/atlantis-harness-gemini.mjs --dry-run
```
**Qué verificar:**
- El CLI debe inicializarse mostrando el texto `Modo: MAREA BAJA (Dry-Run)` en amarillo, permitiendo navegar el flujo sin ejecutar llamadas externas.

### Paso 4: Probar la interactividad del Oráculo
Ejecuta cualquier petición y, en lugar de confirmar inmediatamente (`c`), presiona:
- `a` para agregar manualmente un artesano (puedes usar `agent-front` u otro perfil).
- `e` para editar su modelo recomendado (puedes cambiarlo a `gemini-1.5-pro-high-effort`).
- `d` para eliminar un artesano ruteado.
- Confirma con `c` para validar que el harness procese correctamente tus modificaciones manuales.

---

## 5. Beneficios para la Comunidad de Atlantis

La adopción de esta integración aporta múltiples ventajas estratégicas y operativas para la comunidad:

1. **Apertura Multi-LLM y Multi-Entorno**: Atlantis rompe la dependencia exclusiva de Claude Code. Los desarrolladores que utilicen herramientas de Google (como Antigravity y la familia de modelos Gemini 1.5 y 2.5) ahora pueden aprovechar la arquitectura de orquestación de Atlantis.
2. **Entorno de Simulación Iterativo y de Bajo Costo**: El harness en Node.js permite estructurar, depurar y afinar el roster de agentes e instrucciones locales sin necesidad de realizar llamadas de API reales. Esto facilita la experimentación y validación rápida de la lógica de negocio del orquestador.
3. **Control Interactivo Humano (Human-in-the-loop)**: A diferencia de los flujos automatizados de caja negra, el harness introduce interfaces de confirmación y edición interactiva en el Oráculo y los Guardianes. Esto permite al desarrollador ajustar modelos y tareas específicas en caliente según el contexto actual del desarrollo.
4. **Resiliencia ante Falsos Positivos**: El soporte explícito del tribunal de los Tres Jueces (Minos, Radamantis, Éaco) asegura que las auditorías automatizadas tengan un filtro adversarial robusto, disminuyendo bloqueos innecesarios en ramas de desarrollo complejas.
