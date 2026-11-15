# Fase 2: entrega

Documento de traspaso de [fase2-verificacion-y-revision-semanal.md](fase2-verificacion-y-revision-semanal.md). Fecha: 15 de noviembre de 2026.

| Sección | Estado |
|---|---|
| 3. Verificación y corrección | Hecha (secciones 1 a 7 de este documento) |
| Extra: app de pruebas y escenarios | Hecha (sección 8) |
| 4. Orden interno | Hecha (sección 9) |
| 5. Revisión semanal | Hecha (sección 10); falta la prueba del usuario en el teléfono |

A mitad de la sesión el usuario decidió hacer él mismo las comprobaciones de funciones en el teléfono. Lo que quedó sin probar está en la sección 6, como lista para revisar a mano.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 148 pasan (eran 145) |
| `npx tsc --noEmit` y `npm run build` | Sin errores |
| APK debug | Instalado en el Galaxy S24 Ultra, con todas las correcciones de abajo |
| Teléfono | Restaurado con los datos reales del usuario y comprobado: 1 campaña, 6 misiones, 10 contratos, 7 habilidades, 0 XP |
| Archivos de prueba en el teléfono | Borrados (la imagen de prueba y el respaldo de prueba) |

La especificación decía que el teléfono tenía 9 contratos y ninguna campaña. Tenía **1 campaña, 6 misiones, 10 contratos y 7 habilidades**; eso es lo que se guardó y se restauró. Las copias están en `.respaldos/fase2-datos-reales.json` y `.respaldos/fase2-datos-reales-2.json` (fuera de git).

## 2. Qué se verificó en el teléfono

Todo con datos de demostración y sin llamadas a Gemini.

| Pendiente | Resultado |
|---|---|
| **Celebración de acto** | Funciona: tarjeta con trofeo, candado del acto siguiente abierto, sonido (el sistema registró audio de la app) y vibración |
| **Misión jefe real** | Funciona: sin evidencia no se completa y resalta la bitácora; con evidencia dio +400 XP (el doble de 200) y mostró «¡Campaña completada!» |
| **Foto de evidencia de principio a fin** | Funciona: una imagen de 12 MB elegida en el selector se guardó como JPEG de 277 KB y aparece en el detalle y en la bitácora |
| **Acto sin IA** | Funciona: «Agregar misiones a mano» dejó listo el acto pendiente |
| **Botón atrás** en bitácora, árbol y mapa | Correcto: cierra primero la capa de arriba (visor de fotos, panel de habilidad, hoja de análisis) y nunca saca de la app |
| **Pinch-zoom real en el árbol** | Funciona con dos puntos de toque: acercó de 0.23 a 0.73 y alejó a 0.34 |
| **Árbol grande** (78 habilidades, 6 áreas) | Al moverlo: 90 % de los cuadros en 6 ms y 99 % en 10 ms. Con pellizcos y arrastres mezclados: 90 % en 9 ms y 99 % en 18 ms (un 3.5 % de cuadros lentos, apenas por encima de los 16 ms pedidos). Se veía mal y se corrigió (sección 3) |
| **Respaldo con 30 fotos** | Funciona: con 30 fotos de 348 KB (más pesadas que una foto normal), «Exportar» generó un archivo de 10.8 MB y abrió la hoja de compartir en 1.2 s. Ese mismo archivo se importó desde la app sin errores y llegaron las 30 evidencias |
| **Tema Oro en el teléfono** | El árbol y el panel de habilidad se ven bien |

**Los cinco temas** se revisaron en el navegador, no en el teléfono: Hoy, el mapa de campaña y el detalle del jefe con Ámbar, Neón, Gris y Oro. En el teléfono solo se vio el árbol con Oro.

## 3. Qué se corrigió

| Fallo | Arreglo | Archivo |
|---|---|---|
| La celebración de acto no la anunciaría un lector de pantalla cuando aparecía sobre el detalle de una misión | El foco pasa al botón principal de la celebración (y al de cerrar en el visor de fotos) | `src/ui/ActCelebration.tsx`, `src/ui/EvidenceSection.tsx` |
| «1 FOTOS» en la bitácora | Singular y plural correctos | `src/ui/Journal.tsx` |
| Los avisos «El jefe pide evidencia» y «Misión bloqueada» salían con borde verde | Borde del color de aviso | `src/App.tsx` |
| El texto de las barras de progreso no se leía sobre el relleno claro de los temas Ámbar y Oro | Sobre la parte llena, el texto usa el color de contraste del tema | `src/ui/kit/controls.tsx` |
| El destello del logotipo era un verde fijo | Toma un tono claro del color del tema | `src/ui/kit/Logo.tsx` |
| El icono de «Inteligencia artificial» en Ajustes era violeta fijo | Usa el color de información del tema | `src/ui/settings/SettingsTab.tsx` |
| Árbol grande: ramas como cintas, anillos enormes y solo 4 nodos visibles al abrir | Hojas alternadas en dos alturas (ocupan menos), ramas más finas y vista inicial más alejada | `src/game/skillLayout.ts`, `src/ui/SkillTree.tsx` |
| No había forma de ver un árbol grande entero | El botón de la esquina alterna entre «árbol completo» y la vista inicial | `src/ui/SkillTree.tsx` |
| La leyenda de dominio se encimaba con los nodos | Tiene fondo propio | `src/ui/SkillTree.tsx` |

Las tres primeras filas se corrigieron después de detectarlas, y la versión instalada ya las incluye, pero **no se volvieron a comprobar en el teléfono**.

## 4. Decisiones

- **Cierre del día a las 4:00 a. m. con la app abierta:** cubierto con pruebas automáticas y reloj simulado en `src/ui/useGameDay.test.tsx` (cambio a las 4:00 sin recargar, medianoche que no cambia el día y regreso tras horas en segundo plano). La caducidad de la misión del día, el reinicio de objetivos de contratos y la racha ya tenían pruebas en `src/data/progression.test.ts` y `src/data/gameStore.test.ts`.
- **Contratos antiguos sin campaña:** no se construyó nada. La fase 3 reemplaza los contratos por hábitos, así que una pantalla para elegir cuáles archivar duraría muy poco. Queda documentado.
- **Tamaño del respaldo:** no hizo falta cambiar la compresión ni guardar las fotos aparte.

## 5. Herramientas nuevas para el teléfono

En `scripts/telefono/` (solo con la versión debug):

| Archivo | Para qué |
|---|---|
| `pantalla.mjs` | `texts` lista lo visible, `tap "<texto>"` toca por texto (espera a que aparezca), `shot <nombre>` captura, `back`, `swipe`, `type` |
| `evaluar.mjs` | Evalúa un archivo `.js` dentro de la app |
| `estado.js` | Resumen de la base de datos, para usar con `evaluar.mjs` |
| `pellizco.mjs` | Gesto de dos dedos en el árbol |
| `escenarios/` | Escenarios generados (fuera de git); ver [pruebas-en-telefono.md](pruebas-en-telefono.md) |

`pantalla.mjs shot` guarda la captura junto al script: muévela o bórrala después. **No tomar capturas con el selector de fotos o de archivos abierto**: muestran contenido personal. En esta fase se tomó una por error y se borró de inmediato.

## 6. Lo que falta: lista para revisar a mano

Sin probar en el teléfono:

1. **Botón atrás en el generador.** Misiones › Generar campaña con IA. En la meta, atrás debe cerrar la hoja. En las preguntas, volver a la meta. Mientras diseña, volver a las preguntas. En la vista previa, volver a las preguntas. Nunca debe sacar de la app.
2. **Los cinco temas en el teléfono.** Con nivel suficiente (Ámbar 3, Neón 5, Gris 8, Oro 12), revisar Hoy, Misiones, el mapa, el detalle de una misión y del jefe, el árbol, la bitácora, el generador y Ajustes › Inteligencia artificial. Buscar texto que no se lea o colores que no cambien.
3. **Las tres correcciones sin volver a comprobar:** que la bitácora diga «1 foto»; que el aviso «El jefe pide evidencia» salga con borde naranja; y, con TalkBack, que la celebración de acto se anuncie.
4. **La celebración de acto y la del jefe, con oído y ojo propios:** el sonido y la animación solo se comprobaron por registros del sistema y una captura.
5. **Revisión general** de que nada se vea cortado o encimado en las pantallas nuevas.

## 7. Problemas conocidos

- Con pellizcos y arrastres mezclados en un árbol de 78 habilidades, el 1 % de los cuadros más lentos tarda 18 ms.
- Al desplazar la bitácora con 30 fotos pesadas, la medición dio 90 % de los cuadros en 10 ms y 99 % en 44 ms. La medición no es confiable (se hizo con una hoja abierta encima), así que conviene repetirla si la bitácora se siente lenta.
- En el árbol, las misiones de una habilidad cuyo origen ya no existe aparecen como «Misión borrada».
- Los pendientes de `fase1-entrega.md` que no aparecen aquí como verificados siguen igual; en particular, los reintentos y el modelo de respaldo solo están probados con Gemini simulado.

## 8. App de pruebas, escenarios y modo ahorro

Se agregó a petición del usuario, antes de la sección 4. Desde ahora **el usuario hace las comprobaciones en el teléfono** y cada función se entrega con un escenario. Todo está explicado en [pruebas-en-telefono.md](pruebas-en-telefono.md).

- **«RPG Pruebas»**: variante `pruebas` de Gradle (`android/app/build.gradle`, id `com.gaelgarza.realliferpg.pruebas`), con nombre e icono naranja propios en `android/app/src/pruebas/res/`. Se instala junto a la app personal y tiene sus propios datos.
- **Modo ahorro** (`saver` en los ajustes de IA, `src/ai/session.ts`, `src/platform/build.ts`): todo usa el modelo rápido sin razonamiento, incluido diseñar campañas y actos. Está activo por defecto solo en la app de pruebas y tiene interruptor en Ajustes › Inteligencia artificial. Pruebas en `src/ai/session.test.ts`.
- **Escenarios** (`npm run escenario <nombre>`): `demo`, `temas`, `jefe`, `acto`, `arbol` y `vacio`. Se generan al momento en `src/test/buildSeed.test.ts` con las funciones reales del juego.
- **Scripts** en `scripts/telefono/`: `app.mjs` (adb y elección de app; por defecto la de pruebas, `--personal` para la otra), `volcado.mjs`, `instalar.mjs` (`npm run phone:pruebas` y `npm run phone:instalar`), `llave.mjs` (`npm run phone:llave`) y `escenario.mjs`. `phone:demo` desapareció; `phone:save` ahora respalda la app personal.

## 9. Orden interno (sección 4)

Sin cambios de comportamiento: pasan las mismas 151 pruebas (11 del flujo completo) y la compilación.

| Antes | Ahora |
|---|---|
| `src/data/gameStore.ts` (1,374 líneas) | `src/data/store/`: `shared`, `hud`, `bounties`, `campaigns`, `detail`, `skills`, `quests`, `steps`, `journal`, `daily` (65 a 394 líneas cada uno) |
| `src/ai/gemini.ts` (952) | `src/ai/gemini/`: `types`, `prompts`, `jsonSchemas`, `validation`, `transport`, `resilience`, `inputs`, `calls` |
| `src/ui/GeneratorSheet.tsx` (842) | `src/ui/generator/`: `GeneratorSheet` (orquesta, 288 líneas), `IdeaStep`, `QuestionsStep`, `FailedStep`, `PreviewStep`, `DesignProgress`, `QuestionCard`, `MissionEditor`, `draft` |

- **Cómo importar:** el resto de la app sigue importando de `data/gameStore` y `ai/gemini`, que ahora solo reexportan lo público. Las piezas internas de cada carpeta no salen de ahí. El generador se importa de `ui/generator/GeneratorSheet` (y `forget` de `ui/generator/draft`).
- **Carga diferida** (`src/ui/lazyScreens.ts`): el mapa de campaña, el árbol (pantalla y vista previa del Perfil), la bitácora y el generador se cargan con `React.lazy`. Para que abrirlos siga siendo instantáneo, se descargan en segundo plano en cuanto la app queda libre (`preloadScreens`). La vista previa del árbol reserva su alto mientras carga, para que nada salte.
- **Paquete inicial** (`npx vite build`, solo JavaScript):

| | Sin comprimir | Comprimido |
|---|---|---|
| Antes | 836 KB | 257 KB |
| Después | 791 KB | 248 KB |

  La mayor parte del peso son las librerías (React, Motion, Dexie, zod, iconos), que se usan desde la primera pantalla, así que diferir pantallas solo ahorra unos 45 KB. Como la app se carga desde el APK y no por red, no vale la pena ir más lejos por ahora. Rollup llama `Badge-*.js` al trozo compartido de librerías; es solo un nombre.

### Qué revisar en el teléfono (RPG Pruebas)

Nada debería verse distinto. Para comprobarlo:

1. `npm run escenario demo`: abre una campaña (mapa), el árbol del Perfil y la bitácora. Deben abrir igual de rápido que antes.
2. Con el mismo escenario, Misiones › Generar campaña con IA: escribe una meta, responde las preguntas y llega a la vista previa (usa el modelo rápido por el modo ahorro). Prueba el botón atrás en cada paso.
3. `npm run escenario acto`: completa la misión que falta y genera el Acto 2 con IA, o agrega misiones a mano.

## 10. Revisión semanal (sección 5)

### Cómo funciona

- **Cuándo:** la semana de juego va de lunes a domingo (el día cierra a las 4:00 a. m.). Durante toda la semana siguiente, Hoy muestra la tarjeta «Tu revisión semanal», debajo de la misión del día. La revisión se genera **al abrirla**, una sola vez; después se muestra la guardada.
- **Semana vacía:** no se llama a la IA. La tarjeta dice «Semana tranquila» con un mensaje amable y un botón «Entendido» que la oculta.
- **Jugador nuevo:** si el jugador no tenía contratos ni campañas esa semana, no hay tarjeta.
- **Qué se envía** (`getWeekReport` en `src/data/store/review.ts`, texto en `reviewInput`): misiones completadas, saltadas, deshechas y atascadas; campañas con su avance y los actos cerrados en la semana; contratos día por día; racha al empezar y al terminar; misiones del día; XP por habilidad y número de evidencias. Cada misión y contrato va con una referencia corta (`m1`, `c1`), nunca con su id.
- **Misión atascada:** pendiente, sin bloqueo y desbloqueada hace 5 días o más (`STUCK_AFTER_DAYS`). El día de desbloqueo es el más reciente entre su creación, el día en que se generó su acto y el cierre del acto anterior.
- **Qué devuelve** (esquema y validación en `src/ai/gemini/review.ts`): resumen, logros, dónde te atoraste, hasta 4 ajustes y de 1 a 3 misiones de foco.
- **Ajustes aplicables** (`applyAdjustment`):
  - Dividir una misión atascada en 2 o 3: las nuevas entran al **mismo acto** con la misma habilidad, y la original se borra. El bloqueo no cambia.
  - Cambiar la dificultad de una misión pendiente.
  - Archivar un contrato.
  - Agregar un contrato nuevo.

  Ninguno toca el XP ganado. Si la misión ya se completó o el contrato ya no existe, el ajuste no se aplica y lo explica. Los ajustes con referencias inventadas o del tipo equivocado se descartan al guardar (`planToReview`).
- **Foco:** cada misión recomendada abre su detalle.
- **Modelo:** el principal con razonamiento medio por la API Interactions, con reintentos y respaldo al rápido. Con el modo ahorro (app de pruebas) responde el modelo rápido. Si falla, se ofrece reintentar o usar el modelo rápido.
- **Historial:** tabla `reviews` (Dexie v4, el `id` es el lunes de la semana), con el estado de cada ajuste (pendiente, aplicado o descartado). Se consulta en el Perfil («Revisiones semanales») y en la propia hoja («Revisiones anteriores»). Entra en el respaldo, que pasa a **formato 3** y sigue importando los formatos 1 y 2. «Restablecer progreso» también borra las revisiones.
- **Carga diferida:** la hoja de la revisión se carga aparte, como las otras pantallas pesadas.

### Archivos

| Archivo | Qué hace |
|---|---|
| `src/data/store/review.ts` | Resumen de la semana, tarjeta de Hoy, guardar, aplicar y descartar ajustes |
| `src/ai/gemini/review.ts` | Instrucciones, esquema JSON, validación con zod, texto que se envía y la llamada |
| `src/ai/weeklyReview.ts` | Genera y guarda la revisión (respeta el modo ahorro) |
| `src/ui/review/` | `ReviewCard` (Hoy), `ReviewSheet` (la revisión y el historial), `format` |
| `src/data/review.test.ts` | 11 pruebas: resumen, atascadas, racha, referencias, aplicar sin tocar XP ni bloqueo, respaldo, tarjeta y la llamada |

### Qué revisar en el teléfono (RPG Pruebas)

1. `npm run escenario revision`: en Hoy, toca «Tu revisión semanal». Revisa el texto, toca «Aplicar» en «Dividir misión» y comprueba en Misiones que la misión se cambió por dos en el Acto 1. Prueba «Descartar» en otro ajuste y toca la misión de «Foco».
2. `npm run escenario semana`: abre la tarjeta. Se genera con el modelo rápido (1 llamada). Comprueba que las sugerencias mencionen datos de la semana.
3. `npm run escenario semana-vacia`: en Hoy debe salir «Semana tranquila»; «Entendido» la oculta.

### Sin verificar

- **Ninguna llamada real a Gemini:** todo está probado con Gemini simulado. La primera llamada real será la del escenario `semana`. Si Google rechazara el esquema, el error aparecería ahí, con la opción de reintentar.
- **Calidad con el modelo principal:** la especificación pedía una revisión real con Hydrogen para comprobar que las sugerencias sean específicas. Queda pendiente hasta que el usuario quiera gastar esa llamada (se hace apagando el modo ahorro en RPG Pruebas).

