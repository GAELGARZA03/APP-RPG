# Fase 1: campañas con progresión y árbol de habilidades

Especificación para implementar en una sola sesión de trabajo. Léela completa antes de empezar. Donde algo no esté definido, decide con criterio, aplícalo y anótalo en el reporte final.

---

## 1. Por qué existe esta fase

Real Life RPG convierte metas reales en un juego de rol. Funciona, pero el usuario (Gael) la siente **básica**:

- Las campañas que genera la IA son **listas planas** de unas 6 misiones casi siempre, sin progresión ni reto.
- Gemini adivina el nivel, el tiempo y la fecha del usuario, así que las misiones salen genéricas.
- Casi nunca propone contratos diarios.
- No hay forma de **ver y presumir** lo que has aprendido.

El objetivo es que crear una campaña se sienta como recibir una **misión de videojuego bien diseñada**: un camino por actos, con dificultad creciente, misiones que se desbloquean, una prueba final y un análisis real de la meta. Todo lo aprendido debe hacer crecer un **árbol de habilidades** visible en el Perfil.

---

## 2. Estado actual del proyecto (lo que ya existe)

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4, empaquetado como APK con Capacitor 8. Interfaz en español.

**Datos:** Dexie (IndexedDB) en `src/data/db.ts`, actualmente en la versión 2 del esquema. Tablas: `bounties` (contratos diarios), `campaigns`, `sideQuests`, `xpEvents` (registro de XP: el XP total siempre es la suma de estos eventos), `player` (racha) y `settings`.

**Archivos clave:**

| Archivo | Qué hace |
|---|---|
| `src/game/rules.ts` | XP por dificultad, niveles, racha y progreso de campaña. Lógica pura. |
| `src/game/gameDay.ts` | Día de juego (el día cierra a las 4:00 a. m.). |
| `src/game/cosmetics.ts` | Títulos, temas y sonidos desbloqueables por nivel. |
| `src/data/gameStore.ts` | Todas las lecturas y escrituras del juego. |
| `src/data/backup.ts` | Exportar e importar el respaldo JSON, validado con zod. |
| `src/data/settings.ts` | Ajustes: notificaciones, IA, cosméticos y perfil. |
| `src/ai/gemini.ts` | Cliente de Gemini: prompt, esquema JSON, validación y errores. |
| `src/platform/http.ts` | HTTP nativo en Android (CapacitorHttp) y `fetch` en el navegador. |
| `src/platform/secrets.ts` | API key cifrada con el Android Keystore (plugin propio `SecretStore`). |
| `src/ui/GeneratorSheet.tsx` | Generador actual: idea → vista previa editable → crear. |
| `src/ui/MissionsTab.tsx` | Campañas plegables y Side Quests sueltas. |
| `src/ui/TaskDetail.tsx` | Detalle de misión que crece desde su fila (Motion `layoutId`). |
| `src/ui/ProfileTab.tsx` | Título, estadísticas y recompensas cosméticas. |
| `src/ui/kit/*` | Componentes base (Button, Card, Badge, controles, TaskRow, Avatar, Logo). |
| `src/App.tsx` | Pestañas, hojas, avisos (Sonner), botón atrás de Android. |

**Reglas del juego vigentes** (ver `product_requirements_document.md`):

- XP por dificultad 1 a 5: 20 / 50 / 90 / 140 / 200.
- XP para subir del nivel N al siguiente: `round(100 × N^1.5)`.
- La racha avanza al completar todos los contratos diarios activos. Cada día de racha da +5% en contratos, hasta +50%. Fallar un día la reduce a la mitad.
- Las Side Quests no reciben bono de racha.

**IA actual:** modelo configurable en Ajustes (por defecto `gemini-3.5-flash-lite`), API REST `v1beta/models/{model}:generateContent` con `responseMimeType: application/json` y `responseJsonSchema`. La llave viaja solo en la cabecera `x-goog-api-key`. Cada misión ya trae `description` y `steps`.

**Diseño:** fondo casi negro con brillo verde lima, tarjetas con relieve (`cardSurface` en `src/ui/kit/Card.tsx`), botones en píldora, fuente Fredoka para títulos e Inter para texto, iconos Lucide y animaciones con Motion. Los colores son tokens CSS en `src/index.css` (`--color-signal`, `--color-info`, etc.), y los temas desbloqueables los redefinen.

**Pruebas:** Vitest con `fake-indexeddb`; hoy pasan 58. Comandos: `npm test`, `npx tsc --noEmit`, `npm run build`.

---

**Referencias visuales:** en `docs/referencias/` (fuera de git) hay capturas de la app tal como está (`actual-*.png`) y la imagen de estilo que le gustó al usuario (`referencia-estilo.webp`). Esa imagen es el nivel de acabado al que aspiramos: tarjetas con relieve, brillo verde lima, barras gruesas con texto dentro, fila de días de racha y tarjetas de estadísticas. Toma de ella el estilo, no la marca: nada de su mascota, nombre, gemas ni tipografía. Míralas antes de diseñar las pantallas nuevas.

---

## 3. Qué hay que construir

### Prioridades

Haz las secciones en este orden. Si el tiempo no alcanza, es mejor dejar algo de los últimos niveles sin hacer que dejar a medias algo de los primeros. La calidad visual de la sección F aplica a todo lo que construyas.

1. **Esencial:** A (generación en varios pasos), B (actos, bloqueo y jefe), C (acto por acto), E (modelos según la tarea), y la migración y el respaldo de la sección 5.
2. **Después:** G (mapa de campaña) y H (objetivos marcables).
3. **Después:** D (árbol de habilidades).
4. **Al final:** I (bitácora), J (misión del día) y K (vibración).
5. **Siempre:** las pruebas de lógica de cada parte, al terminarla. Las pruebas del flujo completo (L), al cerrar los niveles 1 y 2.

### A. Generación de campañas en varios pasos

Reemplaza el flujo actual del generador (idea → vista previa) por:

1. **Idea.** El usuario escribe su meta. Se conservan los ejemplos tocables.
2. **Preguntas** (modelo rápido). Gemini lee la idea y devuelve de 2 a 4 preguntas cortas, cada una con 2 a 4 respuestas tocables más la opción de escribir otra. Deben cubrir lo que haga falta para planear bien: nivel actual, tiempo disponible por semana, fecha objetivo, recursos o restricciones. El usuario responde o se las salta.
3. **Diseño de la campaña** (mejor modelo, pensando a fondo). Con la idea, las respuestas y el contexto del jugador, Gemini devuelve:
   - **Nombre** de la campaña.
   - **Análisis:** diagnóstico (de dónde parte el usuario y qué le falta), criterio de éxito ("cómo sabrás que lo lograste"), 2 a 4 obstáculos probables con cómo evitarlos, y una duración estimada.
   - **Actos:** de 2 a 5 según el tamaño real de la meta, cada uno con título, objetivo y dificultad creciente.
   - **Misiones del Acto 1 detalladas.** La cantidad depende de la meta (por ejemplo, de 2 a 6), no un número fijo. Cada misión trae título, dificultad, descripción, 2 a 4 objetivos medibles con cantidades, tiempo estimado, por qué importa para la meta, un consejo y la **habilidad** a la que pertenece.
   - **Misión jefe:** una prueba final al cierre del último acto, más difícil y claramente distinta.
   - **Habilidades:** la rama de la meta y sus sub-ramas (ver sección D).
   - **Contratos diarios sugeridos:** de 0 a 3, solo si sostienen la meta. Deben ser pequeños y realistas sumados a los que el usuario ya tiene.
4. **Vista previa editable.** Muestra el análisis, los actos y las misiones del Acto 1. El usuario puede editar o desmarcar misiones. Los contratos sugeridos aparecen desmarcados. Al aceptar se crea todo en una sola transacción.

**Contexto que se le manda al modelo:** nombres de las campañas activas y sus habilidades (para no repetir y para reutilizar ramas existentes), los contratos diarios activos con su cantidad, el nivel y la racha. Nada más personal.

**Calidad del prompt:** las instrucciones fijas deben exigir misiones concretas y medibles, como en un videojuego. Ya hay un ejemplo de "mal" y "bien" en `src/ai/gemini.ts`. El **Anexo A** de este documento trae una campaña completa que marca el nivel esperado y una mala para contrastar: úsala como referencia para escribir las instrucciones (puedes resumirla dentro del prompt). El tono es de videojuego, pero claro, y todo en español.

**Calidad del resultado:** antes de dar por bueno el generador, haz al menos dos generaciones reales con metas distintas (por ejemplo, una de habilidad como un instrumento y otra de proyecto como lanzar una app) y compáralas con el Anexo A. Si salen genéricas, de tamaño fijo o sin progresión, ajusta las instrucciones y vuelve a probar.

### B. Actos, bloqueo y misión jefe

- Las Side Quests de una campaña pertenecen a un **acto**.
- **Solo el primer acto sin terminar está desbloqueado.** Dentro de ese acto, las misiones se hacen en cualquier orden.
- Los actos siguientes aparecen **bloqueados**, con su título y objetivo visibles. Así el usuario ve el camino y sabe qué viene.
- El acto se completa cuando todas sus misiones están completadas o saltadas.
- **Misión jefe:** pertenece al último acto. Se desbloquea al completar las demás misiones de ese acto, y da XP extra (por ejemplo, el doble de su dificultad). Tiene un aspecto visual distinto.
- **"Ya sé hacer esto":** en el detalle de una misión desbloqueada, permite **saltarla**. Una misión saltada cuenta para avanzar y para el progreso de la campaña, pero **no da XP**. Se puede deshacer.
- Tocar una misión bloqueada abre su detalle de solo lectura, con el motivo ("Completa el Acto 1 para desbloquear").
- **Cambio de regla del PRD:** antes decía que nunca se bloquean tareas. La nueva regla es: **nunca se bloquea por nivel del jugador, pero sí por progreso dentro de una campaña.** Actualiza el PRD.
- **Campañas existentes:** cualquier campaña creada antes de esta fase (por ejemplo, en un respaldo antiguo) pasa a tener todas sus Side Quests en el Acto 1, sin bloqueo, sin misión jefe, sin análisis y sin habilidades. Nada debe romperse.
- Las Side Quests sueltas y los contratos diarios no cambian de comportamiento.

### C. Generación acto por acto

- Al crear la campaña solo se detallan las misiones del Acto 1. Los demás actos guardan su título, objetivo y dificultad prevista.
- Cuando el usuario completa un acto: celebración (aviso, sonido y animación), y el siguiente acto se genera con el mejor modelo **usando cómo le fue**. Por ejemplo, qué misiones saltó (ya sabía), cuánto tardó y si deshizo misiones.
- La generación del siguiente acto la dispara un botón visible ("Generar Acto 2"). Si falla, el acto queda pendiente con un botón para reintentar.
- El usuario puede editar las misiones generadas, igual que hoy.

### D. Árbol de habilidades

- **Estructura:** un árbol con muchas ramas. La raíz es el jugador. Las ramas principales son áreas (por ejemplo "Magia"), y sus sub-ramas son habilidades concretas ("Cartas", luego "Mezclas falsas", "Cardistry"). Gemini propone las ramas al crear la campaña, reutilizando las existentes cuando apliquen.
- **Crecimiento:** cada misión completada suma su XP a su habilidad. Cada habilidad tiene niveles de dominio con umbrales que decidas (por ejemplo: novato, aprendiz, competente, experto, maestro). El XP de una rama es la suma de sus sub-ramas.
- **Visual (lo más importante):** está en el Perfil, como sección destacada con su pantalla completa. Se ve como un árbol que **crece**: los nodos aparecen y se encienden con el XP, ramas más gruesas y brillantes cuanto más dominio, y las habilidades sin progreso se ven apagadas pero visibles. Debe ser algo que el usuario quiera presumir, a la altura del resto del diseño.
- **Interacción:** mover y acercar con los dedos (pan y pinch-zoom), y tocar un nodo para ver su detalle: nombre, nivel de dominio, XP, misiones que lo alimentaron y campaña de origen.
- **Rendimiento:** fluido en el teléfono del usuario (WebView de Android, Chrome 156). Elige la técnica que mejor funcione: SVG, Canvas 2D o WebGL. Si añades una librería, justifícala.
- Los contratos diarios no tienen habilidad por ahora, salvo que lo resuelvas de forma limpia.

### E. Modelos según la tarea

| Tarea | Modelo por defecto |
|---|---|
| Preguntas previas | `gemini-3.5-flash-lite` (rápido) |
| Diseñar la campaña y generar cada acto | `gemini-4-hydrogen` (el mejor con nivel gratuito; salió el 12 de noviembre de 2026) |
| "Detallar con IA" una misión | Rápido |

- Los dos modelos (rápido y principal) deben poder cambiarse en **Ajustes > Inteligencia artificial**. Ya existe un campo de modelo; conviértelo en dos.
- Si el modelo principal falla (saturado, cuota, permiso), **no cambies de modelo en silencio**. Muestra el motivo real, con un botón "Reintentar" y otro opcional "Usar modelo rápido". Ya existen los mensajes de error en `src/ai/gemini.ts`.
- **Razonamiento:** Hydrogen permite elegir cuánto piensa (low / medium / high / xhigh, con high por defecto). En la documentación de Google ese control aparece en su API nueva, Interactions (`POST v1beta/interactions` con `generation_config.thinking_level`). Verifica cómo usarlo, ya sea con `generateContent` o cambiando a Interactions para estas llamadas. Usa un nivel alto para diseñar campañas.
- **Verifica con llamadas reales** antes de darlo por bueno: el nombre del modelo, la salida JSON con esquema y el control de razonamiento. La llave está guardada en el teléfono del usuario (ver sección 5). Las llamadas gastan cuota gratuita, así que haz las mínimas.
- Nota de privacidad: en el nivel gratuito, Google puede usar lo que se envía. El generador ya lo avisa; mantenlo.

**Lo que ya está comprobado con la llave del usuario** (7 de noviembre de 2026):

- `generateContent` con `responseMimeType: 'application/json'` y `responseJsonSchema` funciona con `gemini-3.5-flash-lite` y respeta el esquema. Sin el esquema, el modelo inventó su propia estructura, así que nunca lo quites.
- La API Interactions respondió bien con `POST https://generativelanguage.googleapis.com/v1beta/interactions`, cabeceras `x-goog-api-key` y `Api-Revision: 2026-05-20`, y cuerpo `{ "model": "gemini-3.5-flash-lite", "input": "..." }`. No se probó con esquema JSON ni con razonamiento.
- `gemini-3.8-flash` y `gemini-3.6-flash` respondieron a veces 503 ("high demand").
- En Android las llamadas van por `CapacitorHttp`, sin problemas de CORS. En el navegador no está comprobado que `fetch` directo a Gemini funcione; por eso las pruebas usan Gemini simulado.

**Según la documentación de Google** (12 de noviembre de 2026; aún no comprobado):

- `gemini-4-hydrogen`: estable, con nivel gratuito, salida estructurada y razonamiento low / medium / high / xhigh (high por defecto); contexto de 1M de tokens.
- `gemini-4-argon` y `gemini-4-carbon` son más potentes, pero no tienen nivel gratuito: no los uses por defecto.
- Documentación: https://ai.google.dev/gemini-api/docs/models (redirige a `aistudio.google.com/docs/...`). Revisa también las páginas `thinking`, `structured-output` y `rate-limits`.

### F. Calidad de las pantallas nuevas

Las pantallas nuevas (preguntas, generación, vista previa, mapa de campaña, acto completado, árbol, bitácora y misión del día) deben verse **premium** y coherentes con el diseño actual:

- Usa el kit de `src/ui/kit` y los tokens de color. No hardcodees colores, porque los temas desbloqueables deben seguir funcionando.
- Animaciones con propósito: progreso al generar (pasos visibles, no un spinner largo), candados que se abren al desbloquear y celebración al completar un acto.
- Respeta la reducción de animaciones del sistema (ya hay `MotionConfig reducedMotion="user"`).
- El botón atrás de Android cierra la pantalla u hoja abierta antes de salir. Sigue el patrón de `App.tsx`.
- Accesibilidad: etiquetas en botones con icono, contraste suficiente y áreas táctiles de 44 px como mínimo.

### G. Mapa de campaña

Al abrir una campaña (desde su tarjeta en Misiones), se ve como el **mapa de mundos de un videojuego**, no como una lista:

- Un camino con puntos: cada misión es un punto, cada acto es una zona con su nombre, y la misión jefe es un punto especial al final, como un castillo o una guarida.
- Los puntos completados brillan, el camino hasta la misión actual se ve iluminado, y lo bloqueado se ve apagado con candado.
- Tocar un punto abre el detalle de la misión (el que ya existe). Al completar una misión, se ilumina el tramo hacia la siguiente.
- El análisis de la campaña (diagnóstico, criterio de éxito, obstáculos y duración) se consulta desde esta pantalla.
- Debe funcionar bien con campañas de pocas misiones y de muchas, y con las campañas antiguas de un solo acto.

### H. Objetivos marcables

- Cada objetivo (`steps`) de una misión tiene su casilla en el detalle.
- El progreso se ve en la fila de la misión, por ejemplo "2 / 3".
- Al marcar el último objetivo, la misión se completa sola (con su XP y celebración). Desmarcar uno de una misión completada la deshace.
- En los contratos diarios, las casillas se reinician cada día de juego (a las 4:00 a. m.).
- Las misiones sin objetivos se completan como hoy.

### I. Bitácora de evidencias

- Al completar una misión, el usuario puede agregar **fotos** (de la cámara o la galería) y una **nota**. También puede agregarlas después, desde el detalle.
- La **misión jefe pide evidencia**: no se completa sin al menos una foto o una nota.
- Las fotos se comprimen antes de guardarse (por ejemplo, lado mayor de 1280 px, en JPEG) y se guardan en el teléfono. Limita la cantidad por misión.
- Se ven en el detalle de la misión y en una **bitácora** que reúne todas las evidencias en orden cronológico. Ubícala donde tenga más sentido; el Perfil es buena opción.
- Las evidencias entran en el respaldo JSON. Si el tamaño se vuelve un problema, explica en el reporte cómo lo resolviste.
- Sin video en esta fase.

### J. Misión del día

- Al abrir la app por primera vez en un día de juego, el **modelo rápido** genera **un reto pequeño** (de 15 a 30 minutos) ligado al acto actual de alguna campaña activa o a una habilidad del árbol.
- Aparece destacada en la pestaña Hoy, encima de los contratos.
- Da XP extra (decide cuánto, de forma razonable) y suma a su habilidad. **No afecta la racha** si no se hace. Caduca al cierre del día (4:00 a. m.).
- Si no hay campañas activas, no hay llave, no hay internet o la llamada falla, no se muestra nada roto: la sección se oculta o ofrece reintentar.
- Una sola llamada por día. Si la app se abre varias veces, se reutiliza la misión ya generada.

### K. Vibración

- Vibración sutil (háptica) al completar una misión u objetivo, al desbloquear un acto, al derrotar al jefe y al subir de nivel. Usa el plugin oficial de Capacitor si hace falta.
- Un interruptor en Ajustes permite apagarla.

### L. Pruebas del flujo completo

Además de las pruebas de lógica, agrega **pruebas de integración del flujo de generación**, con Gemini simulado y sin llamadas reales: idea → preguntas → diseño → vista previa → crear → completar el Acto 1 → generar el Acto 2. Incluye también la misión del día y el bloqueo de actos. Elige la herramienta (por ejemplo, Testing Library sobre Vitest, o Playwright contra el servidor de desarrollo) y deja un comando claro para correrlas.

---

## 4. Fuera de alcance

- Revisión semanal con IA, logros, mentor, widget de Android, video en la bitácora, recordatorios por tarea, Firebase y cuentas.
- Cambiar de framework o reescribir partes que funcionan sin necesidad.

---

## 5. Restricciones técnicas

- **Datos del usuario:** el teléfono tiene 5 contratos diarios reales y 2 campañas ("El Despertar del Mago" y "Operacion Cierre Digno: Conquista o Clausura").
  - El usuario autorizó **borrar esas 2 campañas** con sus Side Quests: las volverá a generar con el sistema nuevo. Bórralas desde la app (por ejemplo, con la función de borrar campaña) una vez instalada la versión nueva.
  - **Conserva los 5 contratos diarios**, su historial y el XP. No uses `pm clear`.
  - Las campañas que crees para probar puedes dejarlas si quedaron bien, para que el usuario las vea; avísale en el reporte cuáles son.
- **Migración:** sube el esquema de Dexie a la versión 3 (o la que corresponda), con migración probada desde datos de la versión 2.
- **Respaldo:** el JSON debe incluir los datos nuevos (actos, análisis, habilidades). Debe seguir **importando respaldos antiguos** (versión 1 del formato) y rechazar los dañados. Agrega pruebas.
- **XP:** sigue siendo la suma de `xpEvents`. Saltar una misión no crea evento. La misión jefe sí da XP extra.
- **Seguridad:** nunca imprimas la API key en registros ni en la salida de comandos. Solo viaja en la cabecera.
- **Validación:** valida todo lo que devuelva la IA con zod, como hoy. Recorta textos largos en vez de fallar, y rechaza lo que no sirva con un error claro.
- **Estilo de código:** el que ya tiene el proyecto (Prettier en `.prettierrc.json`: sin punto y coma, comillas simples, 120 columnas), con comentarios en español solo donde aporten el porqué.
- **Commits:** **no hagas commit.** El usuario hace sus commits.

### Casos difíciles que deben funcionar

Son los lugares donde estas funciones suelen romperse. Cúbrelos en el código y, donde se pueda, en las pruebas:

- **Sin internet o error a mitad de la generación:** no se crea nada a medias, y lo que el usuario escribió y respondió no se pierde; puede reintentar.
- **Cerrar la hoja o la app mientras genera:** al volver no hay campañas duplicadas ni actos fantasma.
- **Respuestas raras de la IA:** listas vacías, demasiadas misiones, textos larguísimos o habilidades repetidas con otro nombre. Se validan, se recortan o se rechazan con un mensaje claro.
- **El cierre del día a las 4:00 a. m.:** la misión del día caduca, los objetivos de los contratos se reinician, y nada se cuenta dos veces si la app sigue abierta.
- **Deshacer:** deshacer la misión jefe o una misión de un acto ya cerrado vuelve a bloquear lo que corresponda, de forma coherente, sin XP duplicado ni perdido.
- **Borrar una campaña:** se borran sus actos, misiones y evidencias; su XP ganado se conserva (regla actual); el árbol queda coherente.
- **Temas desbloqueables:** las pantallas nuevas se ven bien con los cinco temas de `src/game/cosmetics.ts`.
- **Botón atrás de Android** en el mapa, el árbol, la bitácora y cada paso del generador.
- **Muchos datos:** un árbol con decenas de habilidades y una campaña con 5 actos se siguen viendo y moviendo fluidos.

---

## 6. Cómo verificar

1. **Pruebas automáticas** para la lógica nueva: bloqueo y desbloqueo de actos, misión jefe, saltar y deshacer, progreso de campaña con saltadas, XP por habilidad y niveles de dominio, migración del esquema y respaldo con datos nuevos y antiguos. Las 58 existentes deben seguir pasando.
2. `npx tsc --noEmit` y `npm run build` sin errores.
3. **En el teléfono** (Samsung Galaxy S24 Ultra, conectado por USB):
   - Compilar e instalar (desde PowerShell):
     ```powershell
     $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
     npm run android:sync
     cd android; .\gradlew.bat assembleDebug; cd ..
     & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
     ```
   - Ruta del SDK en `android/local.properties`. En Git Bash, usa `MSYS_NO_PATHCONV=1` para comandos de `adb` con rutas `/sdcard/...`. Toma las capturas con Bash (`adb exec-out screencap -p > archivo.png`), porque la redirección de PowerShell corrompe los PNG.
   - Para tocar la pantalla: `adb shell input tap` junto con `uiautomator dump`, que expone los textos y `aria-label` de la WebView. Para inspeccionar la app por dentro: DevTools de la WebView con `adb forward tcp:9229 localabstract:webview_devtools_remote_<pid>` y CDP `Runtime.evaluate`. La llave de Gemini se lee dentro de la app con `Capacitor.Plugins.SecretStore.get({ name: 'gemini_api_key' })`; nunca la imprimas.
   - Si la pantalla está bloqueada o el teléfono no responde, avisa y continúa con lo que se pueda verificar en el navegador.
   - Comprueba con una campaña de prueba real: las preguntas, la generación con Hydrogen, el mapa, el bloqueo de actos, marcar objetivos, saltar una misión, completar un acto y generar el siguiente, la evidencia del jefe, la misión del día, la vibración y el árbol creciendo. Revisa que el mapa y el árbol se muevan fluidos y toma capturas. Borra las campañas de prueba que hayan quedado mal; las buenas pueden quedarse.
4. **En el navegador** (`npm run dev`, a tamaño de teléfono), revisa los flujos que no dependan del teléfono.

---

## 7. Criterios de aceptación

- [ ] El generador hace preguntas, diseña la campaña con análisis y actos, y muestra una vista previa editable.
- [ ] La cantidad de misiones y de actos varía según la meta.
- [ ] Hay contratos diarios sugeridos cuando tienen sentido.
- [ ] Los actos se bloquean y desbloquean como se describe, con misión jefe y la opción "Ya sé hacer esto".
- [ ] El siguiente acto se genera al completar el anterior, usando cómo le fue al usuario.
- [ ] Las campañas existentes siguen funcionando, todas en el Acto 1.
- [ ] El árbol de habilidades crece con el XP, se mueve y acerca con los dedos, sus nodos muestran detalle, y se ve fluido en el teléfono.
- [ ] Las campañas se ven como un mapa de videojuego con actos, candados y el jefe al final.
- [ ] Los objetivos se marcan y completan la misión al terminar todos.
- [ ] La bitácora guarda fotos y notas, y la misión jefe pide evidencia.
- [ ] La misión del día se genera una vez al día con el modelo rápido, da XP extra y no afecta la racha.
- [ ] Vibra en los momentos clave, y se puede apagar.
- [ ] Las pruebas de integración del flujo completo pasan con Gemini simulado.
- [ ] Los modelos rápido y principal se configuran en Ajustes; Hydrogen se usa para diseñar, y los errores se muestran sin cambiar de modelo en silencio.
- [ ] El respaldo incluye los datos nuevos, importa los antiguos, y la migración no pierde datos.
- [ ] Pasan las pruebas, `tsc` y `build`, y la app se instaló y probó en el teléfono.
- [ ] El PRD y el `ROADMAP.md` quedan actualizados.

---

## 8. Reporte final

Al terminar, escribe un resumen en español para el usuario:

- Qué construiste y cómo se usa.
- Las decisiones que tomaste donde la especificación no decía nada.
- Qué verificaste y cómo (pruebas, navegador y teléfono), con lo que **no** pudiste verificar.
- Problemas conocidos o pendientes.

---

## Anexo A. Ejemplo del nivel esperado

Sirve para saber qué es una buena campaña y para escribir las instrucciones de Gemini. No es un formato obligatorio: el esquema de datos lo decides tú.

### Una campaña "de 10"

**Idea:** "Quiero aprender a tocar guitarra".

**Respuestas a las preguntas previas:** principiante absoluto; 4 horas a la semana; en 3 meses; tiene una guitarra acústica y el celular.

**Campaña:** *Del silencio al escenario*

**Análisis**
- **Diagnóstico:** sin bases musicales. Con 4 horas a la semana durante 12 semanas (unas 48 horas) es realista dominar los acordes abiertos, los cambios entre ellos y el rasgueo básico para canciones sencillas. La cejilla queda fuera de esta campaña.
- **Cómo sabrás que lo lograste:** tocas de principio a fin 3 canciones con acordes abiertos, sin detenerte, y lo grabas en video.
- **Obstáculos:**
  - Dolor en las yemas los primeros días → sesiones cortas y diarias, en lugar de largas y espaciadas.
  - Frustración con cambios lentos → practicar los cambios con metrónomo a velocidad baja.
  - Sentir que no avanzas → grabarte cada fin de acto y compararte.
- **Duración estimada:** 12 semanas.

**Actos**
1. **Primeros acordes** (semanas 1 a 3): sonar limpio con 4 acordes.
2. **Ritmo y cambios** (semanas 4 a 7): cambiar a tiempo con rasgueos básicos.
3. **Primeras canciones** (semanas 8 a 11): 3 canciones completas.
4. **El concierto** (semana 12): la misión jefe.

**Misiones del Acto 1** (detalladas al crear la campaña)
1. **Afina tu guitarra y conoce sus cuerdas** · dificultad 1 · 15 min · habilidad *Guitarra › Fundamentos*
   - Instala una app de afinador y afina las 6 cuerdas.
   - Nombra las cuerdas de la 6.ª a la 1.ª en voz alta 3 veces sin mirar.
   - *Por qué importa:* tocar desafinado hace que todo suene mal y desmotiva.
   - *Consejo:* afina siempre antes de cada sesión.
2. **Domina Mi menor y La menor** · dificultad 2 · 30 min · *Guitarra › Acordes abiertos*
   - Forma cada acorde 10 veces, haciendo sonar todas las cuerdas sin trastes muertos.
   - Cambia entre Em y Am 20 veces con metrónomo a 60 bpm.
   - *Por qué importa:* son los acordes más fáciles y aparecen en cientos de canciones.
   - *Consejo:* presiona con la punta de los dedos, justo detrás del traste.
3. **Agrega Do y Sol a tu arsenal** · dificultad 3 · 3 sesiones de 20 min · *Guitarra › Acordes abiertos*
   - Forma Do y Sol 10 veces cada uno, sonando limpios.
   - Haz la secuencia Sol → Do → Em → Am 15 veces seguidas sin parar.
4. **Tu primera progresión** · dificultad 3 · 45 min · *Guitarra › Ritmo*
   - Toca Sol – Re – Em – Do con rasgueo hacia abajo, 4 golpes por acorde, a 70 bpm durante 2 minutos sin detenerte.
   - Grábate y escucha si algún acorde suena apagado.

**Contrato diario sugerido:** "Practica cambios de acordes 10 minutos" · dificultad 1 · *Guitarra › Acordes abiertos*.

**Misión jefe (Acto 4):** **El concierto** · dificultad 5 · pide evidencia
- Toca 3 canciones completas para al menos una persona.
- Grábalo en video sin cortes y súbelo a tu bitácora.

**Habilidades:** Música › Guitarra › Fundamentos, Acordes abiertos, Ritmo y Repertorio.

### Una campaña mala (lo que hay que evitar)

**Campaña:** *Aprender guitarra*
1. Practicar acordes · dificultad 3
2. Mejorar el ritmo · dificultad 3
3. Aprender canciones · dificultad 3
4. Practicar más · dificultad 3
5. Tocar una canción · dificultad 3
6. Seguir mejorando · dificultad 3

**Por qué está mal:** siempre 6 misiones; todas con la misma dificultad; ninguna dice cuánto, cuáles ni cómo saber que terminaste; no hay progresión, análisis ni prueba final; y no usa lo que el usuario respondió.
