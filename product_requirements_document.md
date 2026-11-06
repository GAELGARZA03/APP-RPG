# PRD: Real Life RPG (Versión 4.1 - Definitivo)

## 1. Visión General del Producto
Aplicación móvil para Android, distribuida como **APK con Capacitor**, diseñada para transformar el desarrollo personal, las metas y los hábitos diarios en un juego de rol (RPG) con estética retro de consola. Utiliza un motor de IA (vía API de Gemini) para estructurar ideas abstractas en campañas y misiones, operando con un sistema estricto de progresión, rachas y XP controlada por código.

La identidad visual se inspira en las consolas clásicas, pero usa sonidos, tipografías y gráficos propios.

---

## 2. Requerimientos Técnicos y Seguridad
- **Stack Base:** React + Vite + Tailwind CSS (con TypeScript).
- **Motor Móvil:** Capacitor (compilación estricta a archivo `.apk` instalable en Android vía ADB/USB). La interfaz viaja dentro del APK, así que la app funciona de forma independiente del repositorio.
- **Seguridad de API Key:** La llave de Gemini **nunca** se incrusta en el código compilado. Se ingresa una vez en la pantalla de "Ajustes" de la app y se almacena cifrada localmente. Queda excluida de los respaldos `.json`.
- **Almacenamiento y Respaldo:**
  - Almacenamiento local mediante IndexedDB.
  - Botón de exportación e importación de respaldo `.json` (con recordatorio semanal opcional).
  - Llave de firma de Android (*Keystore*) guardada de forma segura fuera del repositorio para evitar bloqueos en futuras actualizaciones del APK.
- **Optimización Samsung:** Manejo explícito de permisos de notificaciones locales y exclusión de las políticas agresivas de ahorro de batería de One UI.
- **Sin conexión:** Todo funciona sin internet, excepto generar misiones con IA.

---

## 3. Interfaz
- Orientación **vertical**, optimizada para usarse con una mano.
- **Navegación por pestañas.**
- **HUD:** nivel, barra de XP y racha actual siempre a la vista.

---

## 4. Mecánicas de Juego y Reglas (Core Loops)

### A. Economía de XP, Niveles y Rachas
- **Dificultad (1-5):** Gemini evalúa la dificultad; la app calcula matemáticamente el XP otorgado:
  - Nivel 1: 20 XP | Nivel 2: 50 XP | Nivel 3: 90 XP | Nivel 4: 140 XP | Nivel 5: 200 XP.
- **Fórmula de Nivel:** XP para pasar del nivel actual al siguiente = `100 × nivel^1.5` (redondeado). Ejemplo: del nivel 1 al 2 son 100 XP; del 2 al 3, 283 XP.
- **Día Cumplido:** Un día cuenta para la racha cuando se completan **todas las Bounties activas** antes del Cierre del Día.
- **Multiplicador de Rachas:** Aplica exclusivamente a las Bounties. Suma **+5% de XP por día de racha**, con un tope máximo de **+50%** (alcanzado en el día 10).
- **Red de Seguridad de Racha:** Fallar un día no borra la racha a cero; la reduce a la mitad. Si se fallan varios días, se reduce a la mitad por cada día fallado.
- **Deshacer:** Las tareas marcadas por error se pueden deshacer, restituyendo el XP.
- **Cierre del Día:** Configurado a las **4:00 a.m.** para no penalizar a quienes trasnochan programando o trabajando.

### B. Estructura de Misiones
1. **Campañas Principales (Main Quests):** Metas grandes desglosadas en *Side Quests*. Su barra de progreso se calcula con el XP completado de sus sub-tareas.
2. **Side Quests:** Tareas secundarias, normalmente vinculadas a campañas. Pueden existir sin campaña; en ese caso no mueven ninguna barra de progreso.
3. **Bounties (Contratos Diarios):** Hábitos diarios repetibles (ej. medicamentos). Se pueden crear y editar manualmente desde el día uno, sin depender de la IA. En las Bounties manuales, el usuario elige la dificultad.
4. **Previsualización:** Obligatorio revisar y editar las misiones generadas por IA, incluida su dificultad, antes de aceptarlas en el HUD.

### C. Notificaciones (Trilogía Diaria)
Para evitar el abandono de la app y el "cementerio de ideas", se programan notificaciones locales en tres momentos del día, con horarios configurables:
1. **Mañana:** Alerta de misión al despertar.
2. **Tarde:** Checkpoint para revisar campañas.
3. **Noche:** Cierre del día y registro antes de dormir.

### D. Progresión Estética (Sin Bloqueos)
- Subir de nivel desbloquea elementos visuales retro, temas de color, títulos de perfil y efectos de sonido. Jamás se bloquean funcionalidades o tareas por falta de nivel.

---

## 5. Fuera de Alcance en Esta Versión
- Árbol de habilidades y sistema de logros (*achievements*).
- Bounties con frecuencia distinta a la diaria (ej. tres veces por semana).

---

## 6. Plan de Desarrollo
- **Sprint 0:** Estructura inicial del proyecto, configuración de Capacitor y primera prueba de compilación en Android.
- **Sprint 1:** Motor de datos local y reglas matemáticas de XP, niveles y rachas.
- **Sprint 2:** Interfaz vertical estilo HUD de consola retro, navegación por pestañas y creación manual de misiones.
- **Sprint 3:** Sistema de respaldos en JSON y notificaciones locales.
- **Sprint 4:** Conexión y validación de respuestas de la API de Gemini para generación de misiones.
- **Sprint 5:** Progresión estética.
