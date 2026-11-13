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
- **Red de Seguridad de Racha:** Fallar un día no borra la racha a cero; la reduce a la mitad. Si se fallan varios días, se reduce a la mitad por cada día fallado. Un día sin Bounties activas no cambia la racha.
- **Deshacer:** Las tareas marcadas por error se pueden deshacer, restituyendo el XP. Una Bounty solo se puede deshacer durante el mismo día, antes del Cierre del Día.
- **Cierre del Día:** Configurado a las **4:00 a.m.** para no penalizar a quienes trasnochan programando o trabajando.

### B. Estructura de Misiones
1. **Campañas Principales (Main Quests):** Metas grandes desglosadas en *Side Quests*. Su barra de progreso se calcula con el XP completado de sus sub-tareas.
2. **Side Quests:** Tareas secundarias, normalmente vinculadas a campañas. Pueden existir sin campaña; en ese caso no mueven ninguna barra de progreso.
3. **Bounties (Contratos Diarios):** Hábitos diarios repetibles (ej. medicamentos). Se pueden crear y editar manualmente desde el día uno, sin depender de la IA. En las Bounties manuales, el usuario elige la dificultad.
4. **Generación en varios pasos:** idea → preguntas previas (modelo rápido) → diseño (modelo principal, razonando a fondo) → vista previa editable. El diseño trae análisis (diagnóstico, criterio de éxito, obstáculos y duración), de 2 a 5 actos, las misiones del Acto 1, una misión jefe, la rama de habilidades y de 0 a 3 contratos diarios, que aparecen desmarcados porque cuentan para la racha. Es obligatorio revisar y poder editar antes de aceptar; todo se crea en una sola transacción.
5. **Actos y bloqueo:** en una campaña solo está abierto el primer acto sin terminar; dentro de él las misiones se hacen en cualquier orden. Un acto se completa cuando todas sus misiones están completadas o saltadas. **Nunca se bloquea por nivel del jugador, pero sí por progreso dentro de una campaña.** Las campañas creadas antes de los actos quedan en un solo acto, sin bloqueo ni jefe.
6. **Generación acto por acto:** las misiones de cada acto siguiente se generan al llegar, con un botón, usando cómo le fue al jugador (qué saltó, cuánto tardó, qué deshizo). Si falla, el acto queda pendiente con reintento.
7. **Misión jefe:** cierra el último acto, se abre al resolver las demás misiones de ese acto, da el doble de XP y pide al menos una foto o una nota.
8. **«Ya sé hacer esto»:** saltar una misión cuenta para avanzar y para el progreso, pero no da XP ni crea evento. Se puede deshacer.
9. **Objetivos marcables:** marcar el último objetivo completa la misión; desmarcar uno de una misión completada la deshace. En los contratos, las casillas se reinician cada día de juego.
10. **Misión del día:** un reto de 15 a 30 minutos generado una vez por día de juego con el modelo rápido. Da 50% más de XP, suma a su habilidad, no afecta la racha y caduca a las 4:00 a. m.
11. **Modelos:** rápido (`gemini-3.5-flash-lite`) y principal (`gemini-4-hydrogen`), configurables en Ajustes. Si el principal falla, se muestra el motivo con «Reintentar» y «Usar modelo rápido»; nunca se cambia de modelo en silencio.
12. **Archivar y Borrar:** Las Bounties se archivan en lugar de borrarse, para conservar su historial. Borrar una campaña borra sus actos, misiones y evidencias, quita su rama del árbol (salvo que otra campaña la comparta) y archiva los contratos creados con ella; el XP ya ganado se conserva. Las campañas terminadas se agrupan en una sección plegable «Completadas».
13. **Restablecer progreso:** en Ajustes, deja el juego en cero (campañas, misiones, árbol, bitácora, XP, nivel, racha y desbloqueos), con opción de conservar los contratos diarios. No toca la llave de Gemini, el perfil ni los recordatorios.

### B2. Árbol de habilidades y bitácora
- **Árbol:** la raíz es el jugador; las ramas son áreas y sus sub-ramas, habilidades concretas. Cada misión completada suma su XP a su habilidad, y cada rama suma el de sus sub-ramas. Niveles de dominio: Novato (0), Aprendiz (100), Competente (300), Experto (700) y Maestro (1500 XP). Vive en el Perfil, con pantalla completa que se mueve y acerca con los dedos.
- **Bitácora:** fotos (comprimidas a 1280 px, máximo 4 por misión) y notas por misión, reunidas en orden cronológico en el Perfil. Entran en el respaldo.
- **Vibración:** al completar una misión u objetivo, al desbloquear un acto, al derrotar al jefe y al subir de nivel. Se apaga en Ajustes.

### C. Notificaciones (Trilogía Diaria)
Para evitar el abandono de la app y el "cementerio de ideas", se programan notificaciones locales en tres momentos del día, con horarios configurables:
1. **Mañana:** Alerta de misión al despertar.
2. **Tarde:** Checkpoint para revisar campañas.
3. **Noche:** Cierre del día y registro antes de dormir.

Horarios iniciales: 8:00, 15:00 y 22:30. Además, un recordatorio semanal opcional de respaldo los domingos a las 20:00. La app pide el permiso de notificaciones, la exclusión del ahorro de batería y el permiso de alarmas exactas, y muestra en Hoy un aviso mientras los recordatorios estén apagados.

### D. Progresión Estética (Sin Bloqueos)
- Subir de nivel desbloquea elementos visuales retro, temas de color, títulos de perfil y efectos de sonido. Jamás se bloquean funcionalidades o tareas por falta de nivel.
- Se eligen en la pestaña **Perfil**. Al subir de nivel, un aviso anuncia lo desbloqueado. Si se baja de nivel (por deshacer una tarea), se muestra la opción inicial hasta recuperarlo. Silenciar los sonidos está disponible desde el nivel 1.

| Nivel | Recompensa |
|---|---|
| 1 | Tema Terminal, título «Aprendiz», sonidos Clásico (o sin sonido) |
| 2 | Título «Explorador» |
| 3 | Tema Ámbar CRT |
| 4 | Título «Aventurero», sonidos Arcade |
| 5 | Tema Neón |
| 6 | Título «Cazador de Contratos», efecto CRT |
| 7 | Sonidos Cristal |
| 8 | Tema Consola Gris |
| 10 | Título «Veterano» |
| 11 | Sonidos Bajo 8-bit |
| 12 | Tema Oro Legendario |
| 15 | Título «Héroe Insomne» |
| 20 | Título «Leyenda Viviente» |

---

## 5. Fuera de Alcance en Esta Versión
- Sistema de logros (*achievements*), revisión semanal con IA, mentor, widget y video en la bitácora.
- Bounties con frecuencia distinta a la diaria (ej. tres veces por semana).

---

## 6. Plan de Desarrollo
- **Sprint 0:** Estructura inicial del proyecto, configuración de Capacitor y primera prueba de compilación en Android.
- **Sprint 1:** Motor de datos local y reglas matemáticas de XP, niveles y rachas.
- **Sprint 2:** Interfaz vertical estilo HUD de consola retro, navegación por pestañas y creación manual de misiones.
- **Sprint 3:** Sistema de respaldos en JSON y notificaciones locales.
- **Sprint 4:** Conexión y validación de respuestas de la API de Gemini para generación de misiones.
- **Sprint 5:** Progresión estética.
- **Fase 1:** Campañas con progresión (actos, jefe, generación acto por acto), mapa de campaña, objetivos marcables, árbol de habilidades, bitácora, misión del día y vibración.
