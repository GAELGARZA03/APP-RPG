# Fase 1: qué se construyó y cómo retomarla

Documento de traspaso. Resume lo hecho a partir de [fase1-progresion-y-arbol.md](fase1-progresion-y-arbol.md), las decisiones tomadas, cómo probar y qué falta. Fecha: 13 de noviembre de 2026. **Nada de esto está en commit**: todo vive en el árbol de trabajo sobre `main`.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 123 pasan (antes de la fase eran 58) |
| `npx tsc --noEmit` y `npm run build` | Sin errores |
| APK debug | Instalado en el Galaxy S24 Ultra |
| PRD y ROADMAP | Actualizados |

## 2. Qué hay de nuevo en la app

- **Generador en varios pasos** (Misiones › Generar campaña con IA): meta → 2 a 4 preguntas con respuestas tocables (modelo rápido) → diseño con progreso por pasos (modelo principal) → vista previa editable → crear en una sola transacción.
- **Actos, bloqueo y misión jefe**: solo está abierto el primer acto sin terminar. El jefe cierra el último acto, da el doble de XP y pide una foto o una nota. «Ya sé hacer esto» salta una misión sin XP y se puede deshacer.
- **Generación acto por acto**: al cerrar un acto hay celebración y un botón «Generar Acto N», que le envía al modelo qué se saltó, cuánto se tardó y qué se deshizo. Si falla, el acto queda pendiente con «Reintentar».
- **Mapa de campaña**: al tocar una campaña se ve un camino con un punto por misión, zonas por acto, candados y el jefe como castillo. El botón «Análisis» muestra diagnóstico, criterio de éxito, obstáculos y duración.
- **Campañas completadas**: en Misiones, sección plegable «Completadas · N» hasta arriba, cerrada por defecto.
- **Objetivos marcables**: marcar el último completa la misión; desmarcar uno la deshace. En los contratos se reinician a las 4:00 a. m.
- **Árbol de habilidades** (Perfil): se mueve con un dedo y se acerca con dos; tocar un nodo muestra dominio, XP, misiones y campaña de origen.
- **Bitácora** (Perfil y detalle de cada misión): fotos de cámara o galería y notas.
- **Misión del día** (Hoy): un reto de 15 a 30 minutos, una llamada automática por día de juego.
- **Vibración**, con interruptor en Ajustes.
- **Dos modelos** en Ajustes › Inteligencia artificial. Si el principal falla se muestra el motivo, con «Reintentar» y «Usar modelo rápido»; nunca cambia solo.
- **Restablecer progreso** (Ajustes): deja el juego en cero.
- **Borrar una campaña** se lleva todo lo suyo.

## 3. Reglas y decisiones (lo que la especificación no definía)

- **API de Gemini**: el modelo principal (`gemini-4-hydrogen`) se llama por la API Interactions (`POST v1beta/interactions`, `generation_config.thinking_level`, `response_format` con esquema JSON). Nivel `high` para diseñar y `medium` para cada acto. El modelo rápido (`gemini-3.5-flash-lite`) sigue en `generateContent`. Comprobado con llamadas reales el 12 de noviembre.
- **Bloqueo**: se deriva siempre de las misiones (`campaignState` en `src/game/rules.ts`); no se guarda. Por eso deshacer una misión de un acto cerrado vuelve a bloquear lo siguiente sin tocar el XP ya ganado.
- **Campañas antiguas** (sin `acts`): cuentan como un solo acto, sin bloqueo ni jefe.
- **XP de habilidades**: cada evento de XP guarda su `skillId`. Dominio: Novato 0, Aprendiz 100, Competente 300, Experto 700, Maestro 1500 XP.
- **Misión del día**: da 50 % más de XP que su dificultad (30 o 75) y no cuenta para la racha.
- **Actos generados**: sus misiones se guardan directo y se editan después, una por una; no hay vista previa del acto.
- **Sin IA**: agregar una misión a mano a un acto pendiente lo deja listo.
- **Bitácora**: máximo 4 fotos y 6 notas por misión; fotos a 1280 px en JPEG; viajan dentro del respaldo.
- **Borrador del generador**: sobrevive a cerrar la hoja, no a cerrar la app.
- **Respaldo**: formato 2; sigue importando el 1. Al importar se conservan los modelos de IA del teléfono.
- **Restablecer progreso**: borra campañas, misiones, árbol, bitácora, misión del día, XP, racha y la elección de tema, título y sonido (con nivel 1 se vuelven a bloquear). Los contratos se borran salvo que se active «Conservar mis contratos diarios». Conserva la llave, los modelos, el perfil, los recordatorios y la vibración. Es así para facilitar pruebas; más adelante se quiere una variante que conserve XP y desbloqueos.
- **Borrar una campaña**: borra actos, misiones y evidencias; quita su rama del árbol (salvo que otra campaña la comparta); archiva los contratos que se crearon con ella. **El XP y el nivel se conservan.** Los contratos creados antes del 13 de noviembre no guardaban su campaña, así que esos no se archivan solos.

## 4. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/game/rules.ts` | Actos y bloqueo, XP del jefe y de la misión del día, dominio |
| `src/game/skillLayout.ts` | Posiciones del árbol (abanico desde la raíz) |
| `src/data/db.ts` | Esquema Dexie v3: `skills`, `evidence`, `dailies` y campos nuevos |
| `src/data/gameStore.ts` | Todas las lecturas y escrituras, incluidos `resetProgress` y `deleteCampaign` |
| `src/data/backup.ts` | Respaldo en formato 2 |
| `src/ai/gemini.ts` | Instrucciones, esquemas, validación y las dos API |
| `src/ai/actRunner.ts`, `src/ai/dailyMission.ts` | Generación de actos y de la misión del día |
| `src/ui/GeneratorSheet.tsx` | Generador en varios pasos |
| `src/ui/CampaignMap.tsx`, `src/ui/MissionsTab.tsx` | Mapa y lista de campañas |
| `src/ui/TaskDetail.tsx`, `src/ui/EvidenceSection.tsx` | Detalle de misión y bitácora de la misión |
| `src/ui/SkillTree.tsx`, `src/ui/Journal.tsx`, `src/ui/DailyCard.tsx` | Árbol, bitácora y misión del día |
| `src/ui/settings/ResetPanel.tsx` | Restablecer progreso |
| `src/ui/backStack.ts` | Botón atrás de Android por capas |

## 5. Cómo probar

```bash
npm test            # todo (lógica + flujo)
npm run test:flow   # solo el flujo completo con Gemini simulado
npx tsc --noEmit
npm run build
```

Instalar en el teléfono (PowerShell):

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:sync
cd android; .\gradlew.bat assembleDebug; cd ..
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

### Datos de prueba por USB (sin gastar llamadas a Gemini)

Con el teléfono conectado, desbloqueado y la versión debug instalada:

```bash
npm run phone:save    # copia TODO lo del teléfono a .respaldos/ (fuera de git; son datos personales)
npm run phone:demo    # genera datos de demostración y los carga; conserva la configuración del teléfono
node scripts/telefono/datos.mjs resumen
node scripts/telefono/datos.mjs cargar .respaldos/<archivo>.json   # volver a un estado guardado
```

Los datos de demostración (`src/test/buildSeed.test.ts`) traen una campaña a medio Acto 2, otra completada con jefe y evidencia, dos contratos con racha, una Side Quest suelta, la misión del día y el árbol con dos áreas. `cargar` reemplaza las tablas del juego, así que **primero `phone:save`**. La API key nunca se lee ni se copia.

Orden recomendado para una sesión de pruebas: `phone:save` → `phone:demo` → probar → `cargar` el archivo guardado (o usar Ajustes › Restablecer progreso).

## 6. Qué se verificó y qué no

**Verificado en el teléfono:** migración sin pérdida; preguntas y diseño reales con Hydrogen (3, 3 y 5 actos en tres metas distintas); objetivos marcables; saltar una misión; cerrar el Acto 1 y generar el Acto 2 real; nota en la bitácora; misión del día; vibración (registro del sistema); árbol al moverlo (99 % de los cuadros en 10 ms o menos); botón atrás en hoja y mapa; sección de completadas; borrado de campaña en cascada; restablecer progreso.

**Sin verificar en el teléfono:**
- Foto de evidencia de principio a fin (el selector abre; no se eligió ninguna foto personal).
- Misión jefe real: su evidencia y el doble de XP solo están cubiertos por pruebas automáticas.
- Las pantallas nuevas con los cinco temas.
- Pinch-zoom real y un árbol con decenas de habilidades.
- Celebración de acto (vista solo en el navegador).
- Cierre del día a las 4:00 a. m. con la app abierta.
- Botón atrás en el árbol, la bitácora y los pasos del generador.

## 7. Problemas conocidos y pendientes

- El tamaño del respaldo con muchas fotos no se midió.
- Los contratos antiguos (sin campaña guardada) no se archivan al borrar su campaña.
- La variante de «Restablecer» que conserva XP y desbloqueos está pendiente.
- Los actos generados no tienen vista previa antes de guardarse.
- El 13 de noviembre se borraron del teléfono, a petición del usuario, las campañas «El Despertar del Mago» y «Operacion Cierre Digno: Conquista o Clausura». Hoy el teléfono tiene los 9 contratos del usuario, sin campañas, con el árbol y el XP en cero.
