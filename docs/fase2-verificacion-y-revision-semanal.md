# Fase 2: verificación, orden interno y revisión semanal

Especificación para una sesión de trabajo. Léela completa antes de empezar, junto con [fase1-entrega.md](fase1-entrega.md), que resume lo construido en la fase 1, sus decisiones y lo que quedó pendiente. Donde algo no esté definido, decide con criterio, aplícalo y anótalo en el reporte final.

---

## 1. Por qué existe esta fase

La fase 1 agregó unas 9,000 líneas en una sola sesión: generador en varios pasos, actos con bloqueo, misión jefe, mapa de campaña, objetivos marcables, árbol de habilidades, bitácora, misión del día, vibración, cuota de modelos y reintentos. Pasan 145 pruebas y la app compila, pero:

- Varias partes **no se probaron en el teléfono** (ver la sección 6 de `fase1-entrega.md`).
- Algunos archivos crecieron demasiado: `src/data/gameStore.ts` (1,374 líneas), `src/ai/gemini.ts` (952) y `src/ui/GeneratorSheet.tsx` (838). El paquete de la app pesa 835 KB (257 KB comprimido) y todo se carga al abrirla.
- Falta la función que el usuario más quiere ahora: una **revisión semanal con IA** que analice cómo le fue y le ayude a ajustar el rumbo.

El objetivo es dejar la app **sólida y verificada de verdad**, con código fácil de mantener, y sumar la revisión semanal.

---

## 2. Prioridades

Haz las partes en este orden. Si el tiempo no alcanza, es mejor dejar algo de las últimas sin hacer que dejar a medias algo de las primeras.

1. **Verificación y corrección** (sección 3): probar en el teléfono lo pendiente y arreglar lo que falle.
2. **Orden interno** (sección 4): dividir los archivos grandes y cargar las pantallas pesadas solo cuando se abren, sin cambiar lo que ve el usuario.
3. **Revisión semanal con IA** (sección 5).

Las pruebas automáticas deben seguir pasando al terminar cada parte.

---

## 3. Verificación y corrección

Prueba en el teléfono cada punto y corrige lo que encuentres. Si algo no se puede probar en el dispositivo, cúbrelo con una prueba automática y dilo en el reporte.

**Antes de tocar datos:** el teléfono tiene los datos reales del usuario (9 contratos diarios, sin campañas). Ejecuta `npm run phone:save` antes de cargar datos de demostración, y al terminar vuelve a cargar ese respaldo con `node scripts/telefono/datos.mjs cargar .respaldos/<archivo>.json`, para dejar el teléfono como estaba. Comprueba al final que siguen los 9 contratos.

| Pendiente | Cómo probarlo |
|---|---|
| **Foto de evidencia de principio a fin** | Copia una imagen de prueba al teléfono con `adb push` a una carpeta de imágenes y avisa a la galería que existe (`content call --method scan_file`). Elígela en el selector, comprueba que se guarda comprimida y aparece en el detalle y en la bitácora. Al terminar, borra la imagen del teléfono. No abras ni elijas fotos personales. |
| **Misión jefe real** | Con los datos de demostración (`npm run phone:demo`), lleva una campaña hasta su jefe: comprueba que no se completa sin evidencia, que da el doble de XP y que su celebración se ve bien. |
| **Celebración de acto** | Cierra un acto en el teléfono y revisa la animación y el sonido. |
| **Los cinco temas** | Revisa todas las pantallas nuevas con los cinco temas de `src/game/cosmetics.ts` (puedes darte el nivel necesario con datos de demostración). Corrige el contraste y los colores fijos que no cambien con el tema. Toma capturas. |
| **Pinch-zoom real en el árbol** | `adb shell input` no hace gestos con dos dedos; usa DevTools de la WebView (CDP `Input.dispatchTouchEvent` con dos puntos de toque). Comprueba que acerca, aleja y se mueve con fluidez. |
| **Árbol grande** | Genera datos de demostración con decenas de habilidades en varias áreas y mide la fluidez al moverlo, como en la fase 1 (cuadros de 16 ms o menos). Si se traba o se encima, mejora el acomodo o el dibujo. |
| **Botón atrás** | En el árbol, la bitácora, el mapa y cada paso del generador: siempre cierra la capa de arriba y nunca sale de la app por error. |
| **Tamaño del respaldo con muchas fotos** | Mide el JSON con unas 30 fotos. Si exportar o importar se vuelve lento o falla, resuélvelo (por ejemplo, más compresión o guardar las fotos aparte) y explícalo. |
| **Cierre del día a las 4:00 a. m. con la app abierta** | No se puede cambiar la hora del teléfono sin root: cúbrelo con pruebas automáticas usando reloj simulado (misión del día, objetivos de contratos y racha). |
| **Contratos antiguos sin campaña** | Al borrar una campaña, los contratos anteriores al 13 de noviembre no se archivan solos. Decide si vale la pena ofrecer algo simple (por ejemplo, en la confirmación de borrado, una lista para elegir cuáles archivar) o dejarlo documentado. |

Revisa también, con ojo de usuario, que nada se vea roto, cortado o encimado en las pantallas nuevas, y corrígelo.

---

## 4. Orden interno del código

Sin cambiar el comportamiento ni lo que ve el usuario:

- **Divide `src/data/gameStore.ts`** por área (por ejemplo: contratos, campañas y actos, misiones, habilidades, bitácora, misión del día, HUD y restablecer). Mantén una forma clara de importar para el resto de la app.
- **Divide `src/ai/gemini.ts`** en piezas con una sola responsabilidad (por ejemplo: instrucciones, esquemas, transporte con las dos API, reintentos y validación).
- **Divide `src/ui/GeneratorSheet.tsx`** en componentes por paso.
- **Carga diferida:** el árbol de habilidades, el mapa de campaña, el generador y la bitácora deben cargarse solo al abrirse (`React.lazy` o equivalente), con un estado de carga que no se note. Mide el paquete inicial antes y después, y repórtalo.
- Los nombres, comentarios y estilo siguen las convenciones del proyecto (Prettier en `.prettierrc.json`; comentarios en español solo donde aporten el porqué).
- Todas las pruebas, incluidas las del flujo completo (`npm run test:flow`), deben pasar sin cambiar lo que prueban.

---

## 5. Revisión semanal con IA

### Qué es

Una vez por semana, Gemini analiza cómo le fue al jugador y le propone **ajustes concretos que puede aplicar con un toque**. Debe sentirse como el informe de un mentor de videojuego: honesto, motivador y útil, no un resumen genérico.

### Cuándo aparece

- La semana de juego va de lunes a domingo, con el cierre del día a las 4:00 a. m.
- Al empezar una semana nueva, en Hoy aparece una tarjeta "Tu revisión semanal" de la semana que terminó. La revisión se genera **cuando el usuario la abre** (no en segundo plano), una sola vez por semana. Si ya existe, se muestra la guardada.
- Si la semana no tuvo actividad, no se llama a la IA: se muestra un mensaje amable que invita a retomar.
- Si quieres, el recordatorio semanal del domingo puede mencionar la revisión, siempre que sea simple.

### Qué analiza (datos que se le envían)

Solo datos del juego de esa semana, sin nada más personal:

- Misiones completadas, saltadas y deshechas, con su campaña, acto, dificultad y habilidad.
- Misiones atascadas: desbloqueadas desde hace varios días sin avance.
- Avance de cada campaña activa y actos cerrados en la semana.
- Cumplimiento de contratos día por día, racha al inicio y al final.
- Misiones del día hechas y no hechas.
- XP ganado por habilidad y evidencias guardadas.

### Qué devuelve

Con esquema JSON validado con zod, como el resto de las llamadas:

- **Resumen** de 2 o 3 frases, en tono de videojuego pero claro.
- **Logros de la semana:** lo que salió bien, con datos ("Cerraste el Acto 1 de *Del silencio al escenario*").
- **Dónde te atoraste:** misiones o contratos con problemas y la causa probable.
- **Ajustes sugeridos**, cada uno aplicable con un botón **"Aplicar"** o descartable. Por ejemplo:
  - Dividir una misión atascada en 2 o 3 más pequeñas (reemplazándola dentro de su acto).
  - Bajar o subir la dificultad de una misión.
  - Archivar un contrato que casi nunca se cumple, o agregar uno nuevo pequeño.
  - Reordenar el foco de la semana.

  Aplicar un ajuste debe usar las funciones existentes del juego, respetar el bloqueo de actos y no tocar el XP ya ganado.
- **Foco de la próxima semana:** de 1 a 3 misiones recomendadas.

### Dónde se guarda

- Cada revisión se guarda (una tabla nueva en Dexie, con su migración) junto con qué ajustes se aplicaron o descartaron.
- Las revisiones anteriores se pueden consultar (por ejemplo, desde el Perfil o la bitácora).
- Entran en el respaldo JSON. El respaldo sigue importando los formatos anteriores.

### Modelo

Usa el **modelo principal** (`gemini-4-hydrogen` por defecto) con razonamiento medio, por la API Interactions como el resto de las llamadas de diseño, con los mismos reintentos y mensajes de error. Es una llamada por semana, así que la calidad importa más que el costo.

### Calidad

Antes de darla por buena, haz al menos una revisión real con datos de demostración que tengan una semana variada (avances, misiones saltadas, un contrato fallado y una misión atascada) y comprueba que las sugerencias sean específicas y aplicables. Si salen genéricas, ajusta las instrucciones.

---

## 6. Fuera de alcance

- Logros, vista previa de actos generados, restablecer conservando XP, widget de Android, video en la bitácora, mentor, recordatorios por tarea, Firebase y cuentas.

---

## 7. Restricciones

- **No hagas commit.** El usuario hace sus commits.
- **Pruebas en el teléfono:** desde el 15 de noviembre se siguen las reglas de [pruebas-en-telefono.md](pruebas-en-telefono.md): el usuario hace las comprobaciones en la app «RPG Pruebas» con escenarios que se le entregan. No toques la app personal. No uses `pm clear`.
- **Cuota de Gemini:** el nivel gratuito es limitado (ver Ajustes › Inteligencia artificial). Haz como máximo unas 10 llamadas reales al modelo principal en toda la sesión. Para lo demás, usa Gemini simulado.
- **Seguridad:** nunca imprimas la API key; solo viaja en la cabecera. La app la lee del `SecretStore`.
- **Diseño:** pantallas nuevas con el kit de `src/ui/kit`, tokens de color (que funcionen con los cinco temas), animaciones con Motion que respeten la reducción de movimiento, y botón atrás por capas (`src/ui/backStack.ts`). Referencias visuales en `docs/referencias/`.
- **Verificación en el teléfono:** la misma de la fase 1 (sección 6 de `fase1-progresion-y-arbol.md` y sección 5 de `fase1-entrega.md`). Si el teléfono no está conectado o está bloqueado, avisa al usuario y sigue con lo que puedas verificar sin él.

---

## 8. Criterios de aceptación

- [ ] Cada pendiente de la sección 3 está probado en el teléfono o cubierto con pruebas, y lo que falló está corregido.
- [ ] Las pantallas nuevas se ven bien con los cinco temas.
- [ ] El teléfono quedó con los datos reales del usuario (9 contratos).
- [ ] `gameStore.ts`, `gemini.ts` y `GeneratorSheet.tsx` están divididos; el comportamiento no cambió.
- [ ] El árbol, el mapa, el generador y la bitácora se cargan bajo demanda, con el paquete inicial medido antes y después.
- [ ] La revisión semanal aparece al empezar la semana, se genera al abrirla, propone ajustes aplicables y guarda el historial.
- [ ] Aplicar un ajuste respeta el bloqueo de actos y el XP ganado.
- [ ] Las revisiones entran en el respaldo, y se siguen importando los formatos anteriores.
- [ ] Pasan `npm test`, `npm run test:flow`, `npx tsc --noEmit` y `npm run build`, y la app se instaló y probó en el teléfono.
- [ ] El `ROADMAP.md` está actualizado.

---

## 9. Reporte final

Escribe `docs/fase2-entrega.md` con el mismo formato que `fase1-entrega.md` (estado, qué hay de nuevo, decisiones, dónde está cada cosa, cómo probar, qué se verificó y qué no, y problemas conocidos), y un resumen corto en español para el usuario.
