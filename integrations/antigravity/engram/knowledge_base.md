# 🔱 Base de Conocimiento de UI & UX (Design Engram)

Este documento es la memoria persistente del sistema de diseño de Atlantis. Los agentes de UI leen este archivo antes de comenzar a construir y lo actualizan al finalizar cada ciclo con los aprendizajes adquiridos.

---

## 🎨 Sistema de Diseño Estándar

### 1. Colores y Paletas
*   **PROHIBIDO:** Usar colores primarios básicos (`red`, `blue`, `green`, `black`, `white` puros).
*   **RECOMENDADO:** Usar paletas sofisticadas basadas en variables HSL o gradientes armónicos:
    *   *Fondo (Oscuro):* `hsl(220, 15%, 8%)`
    *   *Fondo (Claro):* `hsl(210, 20%, 98%)`
    *   *Primario/Acento:* `hsl(190, 70%, 45%)` (Teal vibrante) o `hsl(260, 60%, 60%)` (Morado premium)
    *   *Texto Principal:* `hsl(210, 15%, 95%)`
    *   *Texto Secundario:* `hsl(210, 10%, 65%)`
    *   *Bordes/Líneas:* `hsla(210, 15%, 90%, 0.1)`

### 2. Tipografía Premium
*   **PROHIBIDO:** Usar fuentes por defecto del navegador (`Arial`, `Times New Roman`).
*   **RECOMENDADO:** Importar tipografía moderna de Google Fonts (ej. *Inter*, *Outfit*, o *Roboto*) en el archivo CSS principal:
    ```css
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
    body {
      font-family: 'Outfit', sans-serif;
    }
    ```

### 3. Dinamismo y Micro-animaciones
*   **Botones y Enlaces:** Deben reaccionar al `:hover` y `:focus` de forma suave.
*   **Transiciones:** Usar `transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);` para cambios de color, posición u opacidad.
*   **Glassmorphism:** Usar efectos translúcidos para modales, paneles o cabeceras:
    ```css
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    ```

### 4. Estructura y SEO
*   **Estructura Semántica:** Usar `<header>`, `<main>`, `<section>`, `<footer>` y `<nav>`.
*   **IDs Únicos:** Cada elemento interactivo relevante (botones de login, inputs) debe tener un ID descriptivo único para pruebas de automatización.
*   **Título y Metas:** Incluir títulos descriptivos y meta descripciones en la cabecera HTML.

---

## 📚 Lecciones Aprendidas (Evolución de Conocimiento)

*   *(Aprendizaje de Flujo)* Evitar el uso de colores primarios crudos (como `#ff0000` o `red`) para estados de error de validación. Usar en su lugar tonos HSL suavizados y armónicos (como `hsl(350, 80%, 60%)`) para no romper el aspecto premium del diseño.

*   *(Inicial)* Siempre declarar variables CSS al inicio de `index.css` para centralizar el tema de colores y bordes.
*   *(Inicial)* Las fuentes personalizadas se importan al principio del archivo CSS para evitar destellos de fuentes sin estilo (FOUT).
