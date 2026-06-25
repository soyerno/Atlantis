# Contribuir a Atlantis

Gracias por querer mejorar la ciudad. Reglas cortas:

## Principios

1. **El motor es agnóstico del proyecto.** Toda la especificidad (roster, guardianes, disciplina) vive en el `CONFIG` del usuario, nunca en `atlantis.mjs`. Si tu cambio mete lógica de un proyecto concreto en el motor, va al `CONFIG`, no al núcleo.
2. **Una pieza chica.** Sin servidor, sin dependencias, sin build. `atlantis.mjs` se corre con la tool `Workflow` de Claude Code tal cual. (El puente de Slack en `slack/` es la única parte con dependencias, y es opcional.)
3. **Respetá la voz de la ciudad.** Los seis actos tienen nombre (Oráculo, Heraldos, Artesanos, Guardianes, Jueces, Decreto). Mantené la metáfora consistente en código, comentarios y docs.
4. **Honestidad sobre lo generado.** Si algo no lo probaste, decílo. No declares "hecho" sin verificar.

## Flujo

1. Abrí un issue describiendo el dolor antes de un PR grande.
2. Una rama por cambio. Conventional Commits en el título (`feat:`, `fix:`, `docs:`…).
3. Si tocás el motor, probalo en **marea baja** (`dryRun: true`) sobre un roster de ejemplo antes de pedir review.
4. Mantené el README (ES) y el `README.en.md` en sync si cambiás comportamiento de cara al usuario.

## Qué entra fácil

- Nuevos ejemplos de `CONFIG` para distintos tipos de proyecto.
- Mejoras de los prompts del Oráculo / Guardianes / Jueces / Decreto sin romper el contrato del struct de retorno.
- Adaptadores del puente de Slack a otros chats (manteniendo el **límite de privacidad**: el agente de chat solo ve lo que se origina en el chat + sus reportes programados).

MIT. Al contribuir aceptás que tu aporte se publique bajo esa licencia.
