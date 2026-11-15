# Fase 2: verificación y corrección (sección 3)

Documento de traspaso de la sección 3 de [fase2-verificacion-y-revision-semanal.md](fase2-verificacion-y-revision-semanal.md). Fecha: 15 de noviembre de 2026. Las secciones 4 (orden interno) y 5 (revisión semanal) **no se han empezado**. Nada de esto está en commit.

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
| `datos-arbol.json` | Árbol grande de demostración; lo genera `npm run seed:build` |

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
