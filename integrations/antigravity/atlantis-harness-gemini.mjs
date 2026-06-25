#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colores ANSI para formatear la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  fgRed: '\x1b[31m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgMagenta: '\x1b[35m',
  fgCyan: '\x1b[36m',
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

function header(title) {
  console.log(`\n${colors.bright}${colors.fgCyan}=== ${title.toUpperCase()} ===${colors.reset}`);
}

function log(phase, message, color = colors.reset) {
  console.log(`${colors.bright}${colors.fgBlue}[${phase}]${colors.reset} ${color}${message}${colors.reset}`);
}

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

    console.log(`Opciones: [c] Confirmar y continuar | [e] Editar lane | [a] Agregar lane | [d] Eliminar lane | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return lanes;
    } else if (ans === 'x') {
      rl.close();
      log('Oráculo', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO ARTESANO ---`);
      const profile = await question(`Nombre del perfil (disponibles: ${Object.keys(config.profiles || {}).join(', ')}): `);
      if (!config.profiles?.[profile]) {
        console.log(`Perfil inválido: "${profile}"`);
        continue;
      }
      const task = await question(`Tarea del artesano: `);
      const reason = await question(`Razón de la selección: `);
      const scoreInput = await question(`Score de dificultad (1-5) [3]: `);
      const score = parseInt(scoreInput.trim(), 10) || 3;
      const model = await question(`Modelo recomendado [gemini-1.5-pro]: `) || 'gemini-1.5-pro';
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
        const newModel = await question(`Modelo [${lane.model || 'gemini-1.5-pro'}]: `);
        if (newModel.trim()) lane.model = newModel.trim();
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

    console.log(`Opciones: [c] Confirmar y continuar | [e] Editar guardián | [a] Agregar guardián | [d] Eliminar guardián | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return guardsList;
    } else if (ans === 'x') {
      rl.close();
      log('Guardianes', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO GUARDIÁN ---`);
      const profile = await question(`Nombre del perfil (ej. agent-security): `);
      const lens = await question(`Lente (ej. SEGURIDAD): `);
      const focus = await question(`Enfoque de auditoría: `);
      const model = await question(`Modelo recomendado [gemini-1.5-pro]: `) || 'gemini-1.5-pro';
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
        const newModel = await question(`Modelo [${guard.model || 'gemini-1.5-pro'}]: `);
        if (newModel.trim()) guard.model = newModel.trim();
      } else {
        console.log(`Índice inválido.`);
      }
    }
  }
}

// 1. Leer Configuración (en el mismo directorio)
const configPath = path.join(__dirname, 'atlantis.config.json');
let config = {};
try {
  const fileContent = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(fileContent);
} catch (err) {
  console.error(`${colors.fgRed}Error leyendo atlantis.config.json: ${err.message}${colors.reset}`);
  process.exit(1);
}

// 2. Parsear Argumentos de Consola
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const cleanArgs = args.filter(a => a !== '--dry-run' && a !== '-d');
const request = cleanArgs.join(' ') || 'Revisar la configuración general y documentar cambios';

console.log(`${colors.bright}${colors.fgMagenta}🔱 ATLANTIS — HARNESS DE SIMULACIÓN PARA GEMINI (ANTIGRAVITY)${colors.reset}`);
console.log(`${colors.dim}Petición: "${request}"${colors.reset}`);
if (isDryRun) {
  console.log(`${colors.fgYellow}Modo: MAREA BAJA (Dry-Run)${colors.reset}`);
}
console.log('--------------------------------------------------');

// --- ACTO 1: EL ORÁCULO ---
header('Acto 1 · El Oráculo');
log('Oráculo', 'Analizando la petición en lenguaje natural...');

// Ruteo simple por palabras clave basado en el roster
const profiles = config.profiles || {};
const lanesToRun = [];

const requestLower = request.toLowerCase();
for (const [profile, description] of Object.entries(profiles)) {
  const keywords = {
    'agent-front': ['front', 'ui', 'botón', 'visual', 'pantalla', 'componente', 'css', 'html', 'diseño'],
    'agent-back': ['back', 'api', 'db', 'base de datos', 'server', 'ruta', 'controlador', 'backend', 'modelo'],
    'agent-docs': ['doc', 'readme', 'guia', 'manual', 'spec', 'documentación', 'escribir'],
    'agent-security': ['seguridad', 'auth', 'token', 'crypt', 'login', 'permisos', 'vulnerabilidad']
  }[profile] || [profile.replace('agent-', '')];

  const matches = keywords.some(k => requestLower.includes(k));
  if (matches) {
    let score = 3;
    let model = 'gemini-1.5-pro';
    if (profile === 'agent-docs') {
      score = 2;
      model = 'gemini-1.5-flash';
    } else if (profile === 'agent-security') {
      score = 5;
      model = 'gemini-2.5-pro';
    }
    lanesToRun.push({
      profile,
      task: `Resolver en la especialidad: ${description} para el pedido: "${request}"`,
      reason: `Coincidencia de palabra clave en el requerimiento`,
      score,
      model
    });
  }
}

// Si no coincide ninguna lane, lanzar las predeterminadas
if (lanesToRun.length === 0) {
  log('Oráculo', 'No se identificaron palabras clave directas. Asignando lanes por defecto.', colors.fgYellow);
  lanesToRun.push(
    { profile: 'agent-docs', task: 'Documentar el requerimiento general.', reason: 'Lane por defecto', score: 2, model: 'gemini-1.5-flash' }
  );
}

const complexity = lanesToRun.length > 1 ? 'standard' : 'trivial';
log('Oráculo', `Complejidad detectada: ${complexity.toUpperCase()}`);
log('Oráculo', `Lanes activadas por palabras clave: ${lanesToRun.map(l => l.profile).join(', ')}`);

const finalLanes = await confirmLanes(lanesToRun);
if (!finalLanes.length) {
  log('Oráculo', 'No hay lanes seleccionadas después de la confirmación. Saliendo.', colors.fgRed);
  process.exit(0);
}

// --- ACTO 2: LOS HERALDOS ---
header('Acto 2 · Los Heraldos');
if (config.kickoff) {
  log('Heraldos', `Ejecutando kickoff: ${config.kickoff.profile}`);
  log('Heraldos', `Instrucción: ${config.kickoff.instructions}`);
} else {
  log('Heraldos', 'Fase omitida (kickoff: null o Marea Baja)');
}

// --- ACTO 3: LOS ARTESANOS ---
header('Acto 3 · Los Artesanos');
log('Artesanos', `Despachando ${finalLanes.length} Artesanos en paralelo...`);

const artisanOutputs = [];
finalLanes.forEach(lane => {
  log('Artesanos', `[Artisan: ${lane.profile}] Despachado en su propio lane/worktree... (Modelo: ${lane.model || 'gemini-1.5-pro'})`, colors.fgGreen);
  log('Artesanos', ` > Tarea: ${lane.task}`, colors.dim);
  
  artisanOutputs.push({
    profile: lane.profile,
    status: 'COMPLETED',
    branch: `atlantis-patch-${lane.profile}`,
    summary: `Se completaron las tareas requeridas de ${lane.profile} satisfactoriamente.`
  });
});

// --- ACTO 4: LOS GUARDIANES ---
header('Acto 4 · Los Guardianes');
log('Guardianes', 'Lanzando auditorías siempre-activas y condicionales...');

const mockFindings = [];
const guards = config.guards || [];

const guardsList = guards.map(g => ({
  ...g,
  model: g.profile === 'agent-security' ? 'gemini-2.5-pro' : 'gemini-1.5-pro'
}));

const finalGuards = await confirmGuards(guardsList);

finalGuards.forEach(guard => {
  log('Guardianes', `[Guardian: ${guard.profile}] Auditando la lane despachada bajo lente: ${guard.lens}... (Modelo: ${guard.model})`);
  
  if (guard.profile === 'agent-security' && requestLower.includes('seguridad')) {
    mockFindings.push({
      lens: guard.lens,
      file: 'src/auth/jwt.js',
      line: 42,
      severity: '🔴 BLOQUEANTE',
      description: 'El token de sesión expira en 365 días. Vulnerabilidad potencial de secuestro de sesión.'
    });
  } else if (guard.profile === 'agent-docs' && !requestLower.includes('doc')) {
    mockFindings.push({
      lens: guard.lens,
      file: 'README.md',
      line: 1,
      severity: '🟡 ADVERTENCIA',
      description: 'Se modificó el backend pero no se actualizaron las guías de la API en el README.'
    });
  }
});

if (mockFindings.length === 0) {
  log('Guardianes', 'Auditoría limpia. Ningún hallazgo crítico detectado.', colors.fgGreen);
} else {
  mockFindings.forEach(f => {
    const col = f.severity.includes('🔴') ? colors.fgRed : colors.fgYellow;
    log('Guardianes', `${f.severity} en [${f.file}:${f.line}]: ${f.description}`, col);
  });
}

// --- ACTO 5: LOS TRES JUECES ---
header('Acto 5 · Los Jueces');
const finalFindings = [];

const blockers = mockFindings.filter(f => f.severity.includes('🔴'));
if (blockers.length === 0) {
  log('Jueces', 'No hay bloqueantes 🔴 activos. El tribunal adversarial se saltea.');
  finalFindings.push(...mockFindings);
} else {
  log('Jueces', `Reuniendo al tribunal (Minos, Radamantis, Éaco) para evaluar ${blockers.length} bloqueante(s) 🔴...`);
  
  blockers.forEach(blocker => {
    console.log(`\n  Evaluando bloqueante: "${blocker.description}" en ${blocker.file}`);
    
    const votes = {
      Minos: blocker.file.includes('jwt') ? '🔴 CONFIRMAR' : '🟡 DEGRADAR',
      Radamantis: '🔴 CONFIRMAR',
      Éaco: blocker.file.includes('jwt') ? '🔴 CONFIRMAR' : '🟡 DEGRADAR'
    };
    
    console.log(`    - Minos: ${votes.Minos}`);
    console.log(`    - Radamantis: ${votes.Radamantis}`);
    console.log(`    - Éaco: ${votes.Éaco}`);
    
    const confirmVotes = Object.values(votes).filter(v => v.includes('🔴')).length;
    
    if (confirmVotes >= 2) {
      log('Jueces', `🔴 CONFIRMADO por mayoría (${confirmVotes}/3). El bloqueante sobrevive al Decreto.`, colors.fgRed);
      finalFindings.push(blocker);
    } else {
      log('Jueces', `🟡 DEGRADADO por mayoría. Se convierte en advertencia.`, colors.fgYellow);
      finalFindings.push({
        ...blocker,
        severity: '🟡 ADVERTENCIA'
      });
    }
  });
}

// --- ACTO 6: EL DECRETO ---
header('Acto 6 · El Decreto');
const isBlocked = finalFindings.some(f => f.severity.includes('🔴'));
const decreeStatus = isBlocked ? '🔴 DECRETO BLOQUEADO' : '✅ DECRETO APROBADO';
const decreeColor = isBlocked ? colors.fgRed : colors.fgGreen;

console.log(`${decreeColor}${colors.bright}${decreeStatus}${colors.reset}\n`);

// Imprimir reporte final en Markdown
let markdownReport = `\n# 🔱 DECRETO DE ATLANTIS\n\n`;
markdownReport += `**Estado del Decreto:** ${isBlocked ? '🔴 BLOQUEADO' : '✅ APROBADO'}\n`;
markdownReport += `**Petición original:** *"${request}"*\n`;
markdownReport += `**Complejidad:** \`${complexity.toUpperCase()}\`\n\n`;

markdownReport += `## 🛠️ Lanes Despachadas (Artesanos)\n`;
artisanOutputs.forEach(art => {
  markdownReport += `- **[${art.profile}]** - Estado: \`${art.status}\` | Branch: \`${art.branch}\`\n  *${art.summary}*\n`;
});

markdownReport += `\n## 👁️ Auditoría y Hallazgos (Guardianes & Jueces)\n`;
if (finalFindings.length === 0) {
  markdownReport += `*Sin observaciones. Auditoría 100% limpia.*\n`;
} else {
  finalFindings.forEach(f => {
    markdownReport += `- **${f.severity}** [${f.file}:${f.line}]: ${f.description} (Auditor: \`${f.lens}\`)\n`;
  });
}

markdownReport += `\n## 🧭 Próximos Pasos Recomendados\n`;
if (isBlocked) {
  markdownReport += `1. Corrige los bloqueantes 🔴 detallados arriba en tu rama activa.\n`;
  markdownReport += `2. Vuelve a ejecutar el orquestador Atlantis para auditar nuevamente.\n`;
} else {
  markdownReport += `1. Realiza el merge de las ramas/worktrees indicadas a \`main\`.\n`;
  markdownReport += `2. Realiza el despliegue en staging para pruebas finales.\n`;
}

console.log(markdownReport);
console.log('--------------------------------------------------');
log('Atlantis', 'Simulación de flujo completada.');
