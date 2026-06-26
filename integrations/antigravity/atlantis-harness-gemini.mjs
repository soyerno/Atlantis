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

// Carga de archivo .env de forma nativa sin dependencias
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value.trim();
      }
    });
  }
}

// Cargar variables de entorno
loadEnv();

// Helper para limpiar markdown de respuestas JSON del LLM
function cleanJsonResponse(text) {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.substring(7);
  } else if (clean.startsWith('```')) {
    clean = clean.substring(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.substring(0, clean.length - 3);
  }
  return clean.trim();
}

// Cliente HTTP nativo para la API de Gemini (zero-dependency)
async function callGemini(prompt, systemInstruction = '', schema = null, model = 'gemini-2.5-flash') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada. Agrega la clave a un archivo .env o variable de entorno.');
  }

  // Mapeo simple de nombres a modelos de Gemini
  let geminiModel = 'gemini-1.5-flash'; // default
  if (model.includes('pro')) {
    geminiModel = 'gemini-2.5-pro';
  } else if (model.includes('2.5-flash')) {
    geminiModel = 'gemini-2.5-flash';
  } else if (model.includes('1.5-pro')) {
    geminiModel = 'gemini-1.5-pro';
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  if (schema) {
    requestBody.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: schema
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error en API Gemini (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('La respuesta de Gemini no devolvió texto.');
  }

  if (schema) {
    try {
      return JSON.parse(cleanJsonResponse(text));
    } catch (e) {
      console.warn("Fallo al parsear JSON devuelto por Gemini. Intentando limpiar...", e);
      return JSON.parse(cleanJsonResponse(text));
    }
  }

  return text;
}

const mapModelInput = (val, current) => {
  const clean = val.trim();
  if (!clean) return current;
  if (clean === '1') return 'gemini-1.5-flash';
  if (clean === '2') return 'gemini-2.5-flash';
  if (clean === '3') return 'gemini-1.5-pro';
  if (clean === '4') return 'gemini-2.5-pro';
  return clean;
};

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

    console.log(`Opciones: [c] Confirmar | [e] Editar lane | [a] Agregar lane | [d] Eliminar lane | [f] Forzar modelos gratuitos | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return lanes;
    } else if (ans === 'x') {
      rl.close();
      log('Oráculo', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'f') {
      lanes.forEach(lane => {
        lane.model = lane.score <= 2 ? 'gemini-1.5-flash' : 'gemini-2.5-flash';
      });
      console.log("Se han forzado modelos gratuitos para todos los artesanos.");
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
      
      console.log(`Sugerencias de modelos:`);
      console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
      console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
      const modelInput = await question(`Modelo recomendado [gemini-1.5-pro]: `);
      const model = mapModelInput(modelInput, 'gemini-1.5-pro');
      
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
        
        console.log(`Sugerencias de modelos:`);
        console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
        console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
        const newModelInput = await question(`Modelo [${lane.model || 'gemini-1.5-pro'}]: `);
        lane.model = mapModelInput(newModelInput, lane.model || 'gemini-1.5-pro');
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

    console.log(`Opciones: [c] Confirmar | [e] Editar guardián | [a] Agregar guardián | [d] Eliminar guardián | [f] Forzar modelos gratuitos | [x] Cancelar`);
    const ans = (await question('Selecciona una opción [c]: ')).trim().toLowerCase() || 'c';

    if (ans === 'c') {
      rl.close();
      return guardsList;
    } else if (ans === 'x') {
      rl.close();
      log('Guardianes', 'Ejecución cancelada por el usuario.', colors.fgRed);
      process.exit(0);
    } else if (ans === 'f') {
      guardsList.forEach(guard => {
        guard.model = 'gemini-1.5-flash';
      });
      console.log("Se han forzado modelos gratuitos para todos los guardianes.");
    } else if (ans === 'a') {
      console.log(`\n--- AGREGAR NUEVO GUARDIÁN ---`);
      const profile = await question(`Nombre del perfil (ej. agent-security): `);
      const lens = await question(`Lente (ej. SEGURIDAD): `);
      const focus = await question(`Enfoque de auditoría: `);
      
      console.log(`Sugerencias de modelos:`);
      console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
      console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
      const modelInput = await question(`Modelo recomendado [gemini-1.5-pro]: `);
      const model = mapModelInput(modelInput, 'gemini-1.5-pro');
      
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
        
        console.log(`Sugerencias de modelos:`);
        console.log(`  [Gratuitos]  1: gemini-1.5-flash | 2: gemini-2.5-flash`);
        console.log(`  [Estándar]   3: gemini-1.5-pro   | 4: gemini-2.5-pro`);
        const newModelInput = await question(`Modelo [${guard.model || 'gemini-1.5-pro'}]: `);
        guard.model = mapModelInput(newModelInput, guard.model || 'gemini-1.5-pro');
      } else {
        console.log(`Índice inválido.`);
      }
    }
  }
}

// 1. Leer Configuración
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
const useFreeModels = args.includes('--free-models') || args.includes('-f') || config.useFreeModels === true;
const cleanArgs = args.filter(a => a !== '--dry-run' && a !== '-d' && a !== '--free-models' && a !== '-f');
const request = cleanArgs.join(' ') || 'Revisar la configuración general y documentar cambios';

// Configurar si tenemos API Key
let hasApiKey = !!process.env.GEMINI_API_KEY;

console.log(`${colors.bright}${colors.fgMagenta}🔱 ATLANTIS — HARNESS DE SIMULACIÓN PARA GEMINI (ANTIGRAVITY)${colors.reset}`);
console.log(`${colors.dim}Petición: "${request}"${colors.reset}`);
if (isDryRun) {
  console.log(`${colors.fgYellow}Modo: MAREA BAJA (Dry-Run)${colors.reset}`);
}
if (useFreeModels) {
  console.log(`${colors.fgYellow}Forzando el uso de modelos gratuitos (gemini-1.5-flash / gemini-2.5-flash).${colors.reset}`);
}
if (hasApiKey) {
  console.log(`${colors.fgGreen}API Key de Gemini detectada. Se realizarán llamadas reales a los modelos.${colors.reset}`);
} else {
  console.log(`${colors.fgYellow}API Key de Gemini NO detectada. Corriendo en modo simulación estática (Mocks).${colors.reset}`);
}
console.log('--------------------------------------------------');

// --- ACTO 1: EL ORÁCULO ---
header('Acto 1 · El Oráculo');
log('Oráculo', 'Analizando la petición en lenguaje natural...');

const requestLower = request.toLowerCase();
const isUiTask = ['front', 'ui', 'botón', 'visual', 'pantalla', 'componente', 'css', 'html', 'diseño', 'login', 'layout', 'glassmorphism'].some(k => requestLower.includes(k));

let finalRequest = request;
let engramRules = '';

if (isUiTask) {
  log('Oráculo', 'Se ha detectado un requerimiento de Interfaz de Usuario (UI/UX).', colors.fgMagenta);
  log('Oráculo', 'Consultando la base de conocimiento (Engram) en engram/knowledge_base.md...');
  
  const engramPath = path.join(__dirname, 'engram', 'knowledge_base.md');
  try {
    if (fs.existsSync(engramPath)) {
      const engramData = fs.readFileSync(engramPath, 'utf8');
      log('Oráculo', '¡Engram cargado correctamente!', colors.fgGreen);
      engramRules = engramData.split('## 🎨 Sistema de Diseño Estándar')[1]?.split('## 📚 Lecciones Aprendidas')[0] || '';
    } else {
      log('Oráculo', 'No se encontró el archivo del Engram. Utilizando reglas por defecto.', colors.fgYellow);
    }
  } catch (err) {
    log('Oráculo', `Error al leer el Engram: ${err.message}`, colors.fgRed);
  }

  log('Oráculo', 'Invocando al optimizador de prompts [agent-ui-enhancer] (Prompt Enhancer)...');
  
  if (hasApiKey) {
    try {
      const systemInstruction = `Sos agent-ui-enhancer, el optimizador de prompts de Atlantis. 
      Tu tarea es expandir una petición de UI simple en una especificación premium con variables HSL, fuentes modernas, transiciones y estructura semántica basada en el Engram que se te provee. 
      Devuelve solo la especificación de diseño y el prompt expandido detallado.`;
      
      const prompt = `Petición original: "${request}"\n\nDirectrices de diseño del Engram:\n${engramRules}`;
      
      const response = await callGemini(prompt, systemInstruction, null, 'gemini-1.5-flash');
      finalRequest = response.trim();
      
      console.log(`\n🔱 ${colors.bright}${colors.fgMagenta}PROMPT OPTIMIZADO POR EL MODELO (agent-ui-enhancer):${colors.reset}`);
      console.log(`${colors.fgCyan}${finalRequest}${colors.reset}\n`);
    } catch (err) {
      log('Oráculo', `Fallo al llamar al Enhancer: ${err.message}. Usando simulación de emergencia.`, colors.fgYellow);
      hasApiKey = false; // temporalmente desactivado para fallbacks
    }
  }
  
  if (!hasApiKey || !finalRequest || finalRequest === request) {
    // Simular la expansión inteligente del prompt
    const enhancedPrompt = `Crear un componente de UI responsivo y moderno basado en: "${request}". 
    Especificaciones técnicas agregadas por el agent-ui-enhancer:
    - Estructura semántica HTML5 completa con IDs únicos descriptivos para automatización.
    - Paleta HSL premium (Fondo: oscuro hsl(220, 15%, 8%), Acento: cian vibrante hsl(190, 70%, 45%)) evitando colores básicos.
    - Efectos de Glassmorphism con background translúcido y backdrop-filter blur de 12px.
    - Importación y uso de tipografía moderna Google Fonts (Outfit).
    - Micro-interacciones suaves con transición de 0.3s cubic-bezier para estados hover y focus en elementos interactivos.`;

    console.log(`\n🔱 ${colors.bright}${colors.fgMagenta}PROMPT OPTIMIZADO POR EL AGENTE (agent-ui-enhancer - SIMULADO):${colors.reset}`);
    console.log(`${colors.fgCyan}${enhancedPrompt}${colors.reset}\n`);
    finalRequest = enhancedPrompt;
  }
}

// Ruteo por palabras clave basado en el roster
const profiles = config.profiles || {};
const lanesToRun = [];

for (const [profile, description] of Object.entries(profiles)) {
  if (profile === 'agent-ui-enhancer' || profile === 'agent-ui-critic') {
    continue; // Estos son auxiliares
  }

  const keywords = {
    'agent-ui': ['front', 'ui', 'botón', 'visual', 'pantalla', 'componente', 'css', 'html', 'diseño', 'login', 'layout', 'glassmorphism'],
    'agent-front': ['front', 'ui', 'botón', 'visual', 'pantalla', 'componente', 'css', 'html', 'diseño'],
    'agent-back': ['back', 'api', 'db', 'base de datos', 'server', 'ruta', 'controlador', 'backend', 'modelo', 'login'],
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
    } else if (profile === 'agent-ui') {
      score = 4;
      model = 'gemini-1.5-pro';
    }
    if (useFreeModels) {
      model = score <= 2 ? 'gemini-1.5-flash' : 'gemini-2.5-flash';
    }
    lanesToRun.push({
      profile,
      task: `Resolver en la especialidad: ${description} usando la especificación: "${finalRequest}"`,
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
    { profile: 'agent-docs', task: 'Documentar el requerimiento general.', reason: 'Lane por defecto', score: 2, model: useFreeModels ? 'gemini-1.5-flash' : 'gemini-1.5-flash' }
  );
}

const complexity = lanesToRun.length > 1 ? 'standard' : 'trivial';
log('Oráculo', `Complejidad detectada: ${complexity.toUpperCase()}`);
log('Oráculo', `Lanes activadas por ruteo: ${lanesToRun.map(l => l.profile).join(', ')}`);

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
for (const lane of finalLanes) {
  log('Artesanos', `[Artisan: ${lane.profile}] Despachado en su propio lane/worktree... (Modelo: ${lane.model || 'gemini-1.5-pro'})`, colors.fgGreen);
  log('Artesanos', ` > Tarea: ${lane.task}`, colors.dim);
  if (lane.profile === 'agent-ui' && engramRules) {
    log('Artesanos', ` > [Regla inyectada del Engram]: Prohibido usar colores básicos. Usar Outfit/Inter y transiciones 0.3s.`, colors.fgMagenta);
  }

  let resultSummary = '';
  
  if (hasApiKey) {
    try {
      const systemInstruction = `Sos el Artesano [${lane.profile}] de Atlantis. Tu especialidad es: ${profiles[lane.profile]}.
      Tu deber es resolver el requerimiento de forma detallada. Explica qué harías paso a paso, qué archivos crearías/modificarías, e incluye los bloques de código o configuraciones correspondientes de manera limpia y profesional.`;
      
      const prompt = `Requerimiento asignado:\n"${lane.task}"\n\nPetición original:\n"${request}"\n\nDirectrices de ejecución del preámbulo:\n${config.dispatchPreamble}`;
      
      log('Artesanos', ` > Generando solución real vía LLM...`, colors.fgCyan);
      const response = await callGemini(prompt, systemInstruction, null, lane.model);
      resultSummary = response;
    } catch (err) {
      log('Artesanos', ` > Error llamando a Gemini: ${err.message}. Usando fallback simulado.`, colors.fgYellow);
    }
  }

  if (!resultSummary) {
    // Fallback simulado
    resultSummary = `Se completaron las tareas requeridas de ${lane.profile} satisfactoriamente.\n` + 
                    `[Archivo Creado]: src/components/Login.html (Componente estructurado semánticamente con Outfit, glassmorphism e ID descriptivos)\n` +
                    `[Archivo Creado]: src/components/Login.css (Estilos premium HSL, transiciones suaves de 0.3s en hover y focus)\n` +
                    `Nota: Se usó color de error '#ff0000' en Login.css (intencional para probar la auditoría).`;
  }

  artisanOutputs.push({
    profile: lane.profile,
    status: 'COMPLETED',
    branch: `atlantis-patch-${lane.profile}`,
    summary: resultSummary
  });
}

// --- ACTO 4: LOS GUARDIANES ---
header('Acto 4 · Los Guardianes');
log('Guardianes', 'Lanzando auditorías siempre-activas y condicionales...');

const mockFindings = [];
const guards = config.guards || [];

const guardsList = guards.map(g => ({
  ...g,
  model: useFreeModels ? 'gemini-1.5-flash' : (g.profile === 'agent-ui-critic' ? 'gemini-1.5-pro' : (g.profile === 'agent-security' ? 'gemini-2.5-pro' : 'gemini-1.5-pro'))
}));

const finalGuards = await confirmGuards(guardsList);

const producido = artisanOutputs.map(r => `### [Artesano: ${r.profile}]\nBranch: ${r.branch}\nSalida:\n${r.summary}`).join('\n\n');

// Estructura de salida JSON para Guardianes
const GUARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    clean: { type: 'BOOLEAN', description: 'true si la auditoría está completamente limpia y no hay hallazgos.' },
    findings: {
      type: 'ARRAY',
      description: 'Lista de observaciones encontradas en el código.',
      items: {
        type: 'OBJECT',
        properties: {
          severity: { type: 'STRING', description: '🔴 para bloqueante crítico (frena despliegues), 🟡 para advertencia no bloqueante, ⚪ para notas/mejores prácticas.' },
          file: { type: 'STRING', description: 'Nombre del archivo afectado con su extensión y opcionalmente línea.' },
          line: { type: 'INTEGER', description: 'Línea de código afectada si aplica.' },
          claim: { type: 'STRING', description: 'Detalle de la observación: qué está mal y por qué.' },
          repro: { type: 'STRING', description: 'Pasos para reproducir o justificación del hallazgo.' }
        },
        required: ['severity', 'claim']
      }
    }
  },
  required: ['clean', 'findings']
};

for (const guard of finalGuards) {
  log('Guardianes', `[Guardian: ${guard.profile}] Auditando la lane despachada bajo lente: ${guard.lens}... (Modelo: ${guard.model})`);

  let findingsList = null;

  if (hasApiKey) {
    try {
      const systemInstruction = `Sos el Guardián ${guard.lens} (${guard.profile}) de Atlantis.
      Tu único rol es AUDITAR el código producido por los Artesanos en base a tu enfoque específico: "${guard.focus}".
      Revisa si viola reglas de seguridad, guías de documentación o las pautas estéticas del Engram.
      NO cambies código. Responde estrictamente usando el esquema JSON provisto.
      Nota: Si detectas que se usaron colores primarios directos como 'red' o '#ff0000' en código de UI, levanta un hallazgo BLOQUEANTE (🔴) debido a las directivas estrictas del Engram.`;

      const prompt = `Petición original: "${request}"\n\nTrabajo producido por los Artesanos:\n\n${producido}`;

      log('Guardianes', ` > Realizando auditoría real vía LLM...`, colors.fgCyan);
      const jsonRes = await callGemini(prompt, systemInstruction, GUARD_SCHEMA, guard.model);
      findingsList = jsonRes.findings || [];
      
      if (jsonRes.clean) {
        log('Guardianes', ` > [Guardian: ${guard.profile}] Auditoría limpia.`, colors.fgGreen);
      }
    } catch (err) {
      log('Guardianes', ` > Error llamando a Gemini para guardián: ${err.message}. Usando fallback.`, colors.fgYellow);
    }
  }

  if (findingsList === null) {
    // Fallback simulado
    findingsList = [];
    if (guard.profile === 'agent-ui-critic' && isUiTask) {
      findingsList.push({
        severity: '🔴',
        file: 'src/components/Login.css',
        line: 14,
        claim: 'Se detectó el uso del color crudo #ff0000 para el botón de error de validación, violando la regla del Engram que prohibe colores primarios básicos.',
        repro: 'Ver Login.css línea 14'
      });
      findingsList.push({
        severity: '🟡',
        file: 'src/components/Login.html',
        line: 8,
        claim: 'El botón de login no tiene definido un ID único descriptivo para pruebas automatizadas.',
        repro: 'Agregar un atributo id="..." único'
      });
    } else if (guard.profile === 'agent-security' && requestLower.includes('seguridad')) {
      findingsList.push({
        severity: '🔴',
        file: 'src/auth/jwt.js',
        line: 42,
        claim: 'El token de sesión expira en 365 días. Vulnerabilidad potencial de secuestro de sesión.',
        repro: 'Reducir la expiración a 15 minutos y usar refresh tokens.'
      });
    }
  }

  // Acumular hallazgos
  findingsList.forEach(f => {
    mockFindings.push({
      lens: guard.lens,
      guard: guard.profile,
      file: f.file || '',
      line: f.line || 0,
      severity: f.severity || '🟡',
      description: f.claim
    });
  });
}

if (mockFindings.length === 0) {
  log('Guardianes', 'Auditoría limpia. Ningún hallazgo crítico detectado.', colors.fgGreen);
} else {
  mockFindings.forEach(f => {
    const col = f.severity.includes('🔴') ? colors.fgRed : colors.fgYellow;
    log('Guardianes', `${f.severity} en [${f.file || 'Global'}:${f.line}]: ${f.description}`, col);
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
  
  const VERDICT_SCHEMA = {
    type: 'OBJECT',
    properties: {
      refuted: { type: 'BOOLEAN', description: 'true si el bloqueante debe ser REFUTADO (descartado o degradado a 🟡). false si se confirma y sostiene como bloqueante 🔴.' },
      reason: { type: 'STRING', description: 'Justificación corta y lógica de tu veredicto.' }
    },
    required: ['refuted', 'reason']
  };

  for (const blocker of blockers) {
    console.log(`\n  Evaluando bloqueante: "${blocker.description}" en ${blocker.file}`);

    let votes = {};
    if (hasApiKey) {
      try {
        const JUECES_INSTRUCTIONS = {
          Minos: 'Sos el Juez MINOS de Atlantis. Tu lente es la REPRODUCIBILIDAD: ¿El problema realmente rompe la funcionalidad descrita? ¿Existe el archivo y reproduce con claridad en base a lo provisto?',
          Radamantis: 'Sos el Juez RADAMANTIS de Atlantis. Tu lente es la AUTORIDAD/SCOPE: ¿Este problema es realmente parte del scope de la petición o es deuda técnica preexistente que no debería bloquear esta entrega?',
          Éaco: 'Sos el Juez ÉACO de Atlantis. Tu lente es la SEVERIDAD: ¿Esto amerita bloquear todo el Decreto (🔴) o es una advertencia menor (🟡) que puede pasar?'
        };

        const runJudge = async (name, role) => {
          const prompt = `Petición original: "${request}"
          Hallazgo bloqueante a evaluar:
          - Guardián auditor: ${blocker.guard} (${blocker.lens})
          - Descripción: "${blocker.description}"
          - Archivo: ${blocker.file}:${blocker.line}
          
          Evalúa críticamente si este hallazgo es un bloqueante legítimo o si debe ser refutado/degradado. Devuelve tu veredicto en formato JSON.`;
          
          log('Jueces', ` > Juez ${name} evaluando bloqueante...`, colors.fgCyan);
          return await callGemini(prompt, role, VERDICT_SCHEMA, 'gemini-1.5-flash');
        };

        const vMinos = await runJudge('Minos', JUECES_INSTRUCTIONS.Minos);
        const vRadamantis = await runJudge('Radamantis', JUECES_INSTRUCTIONS.Radamantis);
        const vÉaco = await runJudge('Éaco', JUECES_INSTRUCTIONS.Éaco);

        votes = {
          Minos: vMinos.refuted ? `🟡 DEGRADADO: ${vMinos.reason}` : `🔴 CONFIRMADO: ${vMinos.reason}`,
          Radamantis: vRadamantis.refuted ? `🟡 DEGRADADO: ${vRadamantis.reason}` : `🔴 CONFIRMADO: ${vRadamantis.reason}`,
          Éaco: vÉaco.refuted ? `🟡 DEGRADADO: ${vÉaco.reason}` : `🔴 CONFIRMADO: ${vÉaco.reason}`
        };

      } catch (err) {
        log('Jueces', ` > Error en tribunal LLM: ${err.message}. Usando simulación de votación.`, colors.fgYellow);
        hasApiKey = false;
      }
    }

    if (!hasApiKey || !votes.Minos) {
      // Fallback simulado de votos
      if (blocker.file.includes('Login.css')) {
        votes = {
          Minos: '🔴 CONFIRMAR (El color rojo puro rompe la estética premium y viola las directrices estéticas)',
          Radamantis: '🔴 CONFIRMAR (La violación de la regla del Engram sobre colores primarios es estricta)',
          Éaco: '🟡 DEGRADAR (Se puede resolver en el siguiente commit, pero técnicamente el botón funciona)'
        };
      } else {
        votes = {
          Minos: '🔴 CONFIRMAR',
          Radamantis: '🔴 CONFIRMAR',
          Éaco: '🔴 CONFIRMAR'
        };
      }
    }

    console.log(`    - Minos: ${votes.Minos}`);
    console.log(`    - Radamantis: ${votes.Radamantis}`);
    console.log(`    - Éaco: ${votes.Éaco}`);

    const confirmVotes = Object.values(votes).filter(v => v.includes('🔴')).length;

    if (confirmVotes >= 2) {
      log('Jueces', `🔴 CONFIRMADO por mayoría (${confirmVotes}/3). El bloqueante sobrevive inicialmente al Decreto.`, colors.fgRed);
      
      if (blocker.file.includes('Login.css')) {
        // Simular autocorrección (Hotfix) del Artesano UI
        console.log(`\n🔧 ${colors.bright}${colors.fgGreen}[Hotfix del Artesano UI]${colors.reset} Aplicando corrección estética sugerida por los Jueces...`);
        console.log(`   * Reemplazando '#ff0000' por 'hsl(350, 80%, 60%)' (Tono de rojo pastel premium armónico) en src/components/Login.css:14`);
        log('Guardianes', 'Re-auditando archivo modificado por el Abogado del Diablo...', colors.fgYellow);
        log('Guardianes', '✅ RE-AUDITORÍA LIMPIA. El bloqueante ha sido mitigado.', colors.fgGreen);
        
        finalFindings.push({
          ...blocker,
          severity: '✅ CORREGIDO (HOTFIX)',
          description: blocker.description + ' (Corregido automáticamente a hsl(350, 80%, 60%))'
        });
      } else {
        finalFindings.push(blocker);
      }
    } else {
      log('Jueces', `🟡 DEGRADADO por mayoría. Se convierte en advertencia.`, colors.fgYellow);
      finalFindings.push({
        ...blocker,
        severity: '🟡 ADVERTENCIA'
      });
    }
  }

  // Agregar hallazgos que no eran bloqueantes
  finalFindings.push(...mockFindings.filter(f => !f.severity.includes('🔴')));
}

// --- ACTO 6: EL DECRETO ---
header('Acto 6 · El Decreto');
const isBlocked = finalFindings.some(f => f.severity.includes('🔴'));
const decreeStatus = isBlocked ? '🔴 DECRETO BLOQUEADO' : '✅ DECRETO APROBADO';
const decreeColor = isBlocked ? colors.fgRed : colors.fgGreen;

console.log(`${decreeColor}${colors.bright}${decreeStatus}${colors.reset}\n`);

let markdownReport = '';

if (hasApiKey) {
  try {
    const systemInstruction = `Sos el Decreto de Atlantis, la fase final que reconcilia todo en un veredicto.
    Genera un reporte conciso y formal en Markdown describiendo el estado (APROBADO o BLOQUEADO),
    las tareas realizadas por los Artesanos, las observaciones encontradas de los Guardianes y veredictos de los Jueces.
    Termina con los pasos a seguir para el humano (quien realiza merges y despliegues).`;

    const prompt = `Petición original: "${request}"
    Estado general: ${isBlocked ? 'BLOQUEADO' : 'APROBADO'}
    Resultados de Artesanos:
    ${JSON.stringify(artisanOutputs)}
    
    Hallazgos finales del tribunal (Guardianes y Jueces):
    ${JSON.stringify(finalFindings)}`;

    log('Decreto', 'Generando Decreto final vía LLM...', colors.fgCyan);
    markdownReport = await callGemini(prompt, systemInstruction, null, 'gemini-1.5-flash');
  } catch (err) {
    log('Decreto', `Error en Decreto LLM: ${err.message}. Usando reporte estructurado local.`, colors.fgYellow);
  }
}

if (!markdownReport) {
  // Imprimir reporte final en Markdown por defecto
  markdownReport = `\n# 🔱 DECRETO DE ATLANTIS\n\n`;
  markdownReport += `**Estado del Decreto:** ${isBlocked ? '🔴 BLOQUEADO' : '✅ APROBADO'}\n`;
  markdownReport += `**Petición original:** *"${request}"*\n`;
  markdownReport += `**Complejidad:** \`${complexity.toUpperCase()}\`\n\n`;

  if (isUiTask) {
    markdownReport += `## 💡 Optimización de Prompt (agent-ui-enhancer)\n`;
    markdownReport += `- **Prompt Expandido:** *"${finalRequest.replace(/\n/g, ' ')}"*\n\n`;
  }

  markdownReport += `## 🛠️ Lanes Despachadas (Artesanos)\n`;
  artisanOutputs.forEach(art => {
    markdownReport += `- **[${art.profile}]** - Estado: \`COMPLETED\` | Branch: \`${art.branch}\`\n  *${art.summary.substring(0, 300)}...*\n`;
  });

  markdownReport += `\n## 👁️ Auditoría y Hallazgos (Guardianes & Jueces)\n`;
  if (finalFindings.length === 0) {
    markdownReport += `*Sin observaciones. Auditoría 100% limpia.*\n`;
  } else {
    finalFindings.forEach(f => {
      markdownReport += `- **${f.severity}** [${f.file}:${f.line}]: ${f.description} (Auditor: \`${f.lens || f.guard}\`)\n`;
    });
  }

  markdownReport += `\n## 🧭 Próximos Pasos Recomendados\n`;
  if (isBlocked) {
    markdownReport += `1. Corrige los bloqueantes 🔴 detallados arriba en tu rama activa.\n`;
    markdownReport += `2. Vuelve a ejecutar el orquestador Atlantis para auditar nuevamente.\n`;
  } else {
    markdownReport += `1. Realiza el merge de las ramas/worktrees indicadas a \`main\`.\n`;
    markdownReport += `2. Realiza el despliegue en staging para pruebas finales.\n`;
    
    if (isUiTask) {
      markdownReport += `3. **Evolución del Engram:** Se ha registrado una nueva lección sobre el uso de colores de error en la base de conocimiento.\n`;
    }
  }
}

console.log(markdownReport);
console.log('--------------------------------------------------');

// --- ACTUALIZACIÓN DINÁMICA DEL ENGRAM (Solo si el Decreto es aprobado y es una tarea de UI) ---
if (!isBlocked && isUiTask && !isDryRun) {
  log('Decreto', 'Actualizando la base de conocimiento (Engram) con nuevos aprendizajes de UI/UX...');
  try {
    const engramPath = path.join(__dirname, 'engram', 'knowledge_base.md');
    if (fs.existsSync(engramPath)) {
      let engramContent = fs.readFileSync(engramPath, 'utf8');
      
      const newLesson = `*   *(Aprendizaje de Flujo)* Evitar el uso de colores primarios crudos (como \`#ff0000\` o \`red\`) para estados de error de validación. Usar en su lugar tonos HSL suavizados y armónicos (como \`hsl(350, 80%, 60%)\`) para no romper el aspecto premium del diseño.`;
      
      if (!engramContent.includes('hsl(350, 80%, 60%)')) {
        const splitContent = engramContent.split('## 📚 Lecciones Aprendidas (Evolución de Conocimiento)');
        if (splitContent.length === 2) {
          const updatedContent = `${splitContent[0]}## 📚 Lecciones Aprendidas (Evolución de Conocimiento)\n\n${newLesson}${splitContent[1]}`;
          fs.writeFileSync(engramPath, updatedContent, 'utf8');
          log('Decreto', '¡Base de conocimiento (Engram) actualizada exitosamente!', colors.fgGreen);
        }
      } else {
        log('Decreto', 'La lección de diseño ya existe en el Engram. Omitiendo duplicado.', colors.dim);
      }
    }
  } catch (err) {
    log('Decreto', `Error al escribir en el Engram: ${err.message}`, colors.fgRed);
  }
}

log('Atlantis', 'Simulación de flujo completada.');
