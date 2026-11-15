# Fase 3, parte 1: navegación y libreta de hábitos

Entrega de la parte 1 de [fase3-libreta-habitos-y-recompensas.md](fase3-libreta-habitos-y-recompensas.md). Fecha: 15 de noviembre de 2026. Nada de esto está en commit.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 172 pasan (eran 162): 9 nuevas de hábitos y libreta, 1 de flujo y las de racha reescritas con las reglas nuevas |
| `npx tsc --noEmit` y `npm run build` | Sin errores. Paquete inicial: 530 KB (160 KB comprimido) |
| RPG Pruebas | Instalada con esta versión |
| App personal | Sin actualizar: al instalarla, la migración convierte tus contratos en hábitos (ver sección 5) |

## 2. Qué hay de nuevo

- **Cinco pestañas:** Hoy, Misiones, Libreta, Bitácora y Perfil.
- **Menú del logotipo:** al tocar el logo (arriba a la izquierda) se abre un menú lateral con Ajustes (en pantalla completa, con todas sus secciones), Reglas del juego y Acerca de. Las dos últimas son las mismas secciones de Ajustes. El botón atrás cierra el menú antes que nada.
- **Bitácora:** ahora es una pestaña, con las evidencias de las misiones. El botón del Perfil lleva ahí.
- **Hábitos** en lugar de contratos diarios:
  - Nombre, emoji opcional, dificultad, frecuencia (todos los días o ciertos días de la semana), objetivos y orden.
  - Se crean, editan, archivan (conservando historial y XP) y reordenan desde Libreta › Hábitos.
- **Registro por día** con cuatro estados: sin registrar, hecho, a medias y no hecho.
  - Hecho da el XP completo y a medias, la mitad.
  - Hoy y ayer dan XP y cuentan para la racha. Los días anteriores del mes se corrigen solo como registro, sin tocar el XP.
- **Libreta mensual:**
  - Un renglón por día y una columna por hábito, con el nombre en vertical como en un bullet journal y un fondo de puntos en el color del tema.
  - Tocar una casilla la cambia: vacío → hecho → a medias → no hecho → vacío. Los cuatro estados se distinguen por forma y no solo por color: palomita, mitad rellena con «½», tache y casilla vacía.
  - Los días que no tocan llevan un punto, hoy va resaltado y la columna de días queda fija al desplazarse de lado.
  - Al pie de cada columna van el cumplimiento del mes y la racha.
  - Navegación entre meses; al abrir el mes actual se centra en hoy.
- **Hoy:** «Contratos de hoy» se cambió por «Hábitos de hoy», con los hábitos que tocan hoy, marcado de un toque y botones «Ver libreta» y «Nuevo hábito». El detalle de un hábito ofrece «Lo hice a medias».
- **Racha general** (sustituye a la de contratos): un día cuenta si se ganó XP con algo (una misión de campaña o del día, o un hábito hecho o a medias), y un día sin nada la reduce a la mitad. El bono de +5 % por día (hasta +50 %) se aplica a los hábitos y a la misión del día, que ahora también cuenta para la racha.
- **Racha por hábito:** días programados seguidos con el hábito hecho o a medias. Los días que no tocan no la rompen, y hoy sin registrar tampoco.
- **Generador:** sugiere hábitos en lugar de contratos; al aceptarlos se agregan a la libreta como hábitos diarios.
- **Revisión semanal:** analiza los hábitos día por día (✓, ½, ✗, sin registrar) y sus ajustes archivan o agregan hábitos.

## 3. Decisiones

- **Renombrado completo:** en todo el código, «bounty» pasó a ser «habit», incluidas las funciones, los tipos y la referencia `TaskRef` (`kind: 'habit'`). La tabla vieja `bounties` se migra y después se borra.
- **Base de datos v5 y v6** (`src/data/db.ts`):
  - Cada contrato pasa a ser un hábito diario, en su orden de creación.
  - Cada día cumplido queda como «hecho» en la tabla nueva `habitLogs`.
  - Los eventos de XP, las evidencias y los ajustes de revisiones guardadas cambian de `bounty` a `habit`.
  - Al final se borra la tabla `bounties`.
- **Respaldo formato 4:** agrega `habitLogs`. Los respaldos 1 a 3 se convierten al importarlos, igual que la migración (`upgradeLegacy` en `src/data/backup.ts`).
- **El XP sigue en los eventos de XP:** el registro (`habitLogs`) guarda el estado de cada día, y solo los cambios de hoy y ayer crean o quitan eventos de XP. Así, corregir días viejos nunca cambia el XP ni la racha.
- **Corregir ayer recalcula la racha de ese día** (`resettleYesterday`): se guarda la racha con la que empezó el último día cerrado (`streakBeforeLast`). El bono de ayer es el de la racha con la que empezó ayer.
- **Racha sin registro guardado:** se cuenta desde el primer día con XP, sea hábito o misión. Antes, si lo primero que hacías era una misión, la racha no arrancaba.
- **Cumplimiento del mes:** cuenta los días programados hasta ayer, y hoy solo si ya se registró. «A medias» vale 0.5.
- **Semana de la racha (Hoy):** «día cumplido» ahora significa «día con algún avance». El estado `rest` ya no se usa.
- **Título cosmético:** «Cazador de Contratos» pasó a ser «Cazador de Hábitos».
- **Pantallas diferidas:** la Libreta y la Bitácora se cargan aparte, como el resto de las pantallas pesadas.

## 4. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/data/store/habits.ts` | Hábitos: registro por día, ventana de XP, racha por hábito, orden y datos de la libreta |
| `src/data/store/shared.ts` | Racha general por actividad, `isScheduledOn`, `resettleYesterday` |
| `src/game/rules.ts` | `habitXp` con «a medias», `dailyXp` con bono, `isScheduledWeekday`, `HABIT_XP_WINDOW_DAYS` |
| `src/ui/notebook/` | `NotebookTab` (cuadrícula) y `HabitsSheet` (administrar) |
| `src/ui/menu/SideMenu.tsx` | Menú del logotipo |
| `src/ui/FormSheet.tsx` | Emoji y frecuencia en el formulario de hábitos |
| `src/data/habits.test.ts` | Pruebas de hábitos, libreta, racha por hábito y respaldos viejos |

## 5. Cómo probar

En RPG Pruebas (ver [pruebas-en-telefono.md](pruebas-en-telefono.md)):

```bash
npm run escenario libreta
```

12 hábitos (diarios y de ciertos días) con el mes registrado. Revisa:

1. Pestaña Libreta: se lee con 12 columnas, la columna de días queda fija al desplazarte de lado y hoy está resaltado.
2. Toca casillas de hoy y de ayer: dan XP (aviso). Toca una de hace una semana: cambia, pero sin XP.
3. Los hábitos de ciertos días tienen puntos en los días que no tocan.
4. Libreta › Hábitos: reordena, edita (emoji y días) y archiva uno.
5. Hoy: «Hábitos de hoy» con marcado de un toque; abre uno y prueba «Lo hice a medias».
6. Logo → menú → Ajustes, Reglas y Acerca de; el botón atrás cierra el menú.

```bash
npm run escenario demo
```

Comprueba la racha general, la misión del día con bono y que la Bitácora sea una pestaña.

**Tu app personal:** antes de instalar esta versión, haz un respaldo. Al abrirla, la migración convierte tus contratos en hábitos diarios con su historial, y conviene comprobar que llegaron todos.

```bash
npm run phone:save
```

```bash
npm run phone:instalar
```

## 6. Sin verificar

- Nada se revisó en el teléfono: lo prueba el usuario con los escenarios.
- La migración v5 está probada con una base de datos v2 simulada y con un respaldo v3. Con tus datos reales se comprobará al instalar la app personal.
- Ninguna llamada real a Gemini en esta parte. Los cambios de texto del generador y de la revisión solo se probaron con Gemini simulado.

## 7. Cambios tras la primera revisión del usuario

- **Cuatro pestañas:** Hoy, Misiones, Libreta y Bitácora. Con cinco, la barra se partía en dos renglones. El Perfil pasó al menú del logotipo, como pantalla completa; el árbol que se abre desde ahí regresa al Perfil al cerrarlo.
- **Libreta rediseñada:** ahora los hábitos van en filas y los días en columnas, con un selector de vista «3 días | 7 días | Mes».
  - 3 y 7 días muestran los últimos días hasta hoy y llenan el ancho sin desplazarse.
  - La vista de mes se desplaza de lado y se centra en hoy.
  - Las flechas cambian de periodo, y «Ir a hoy» regresa al presente.
  - Cada fila muestra el emoji, el nombre, la racha y el cumplimiento del periodo.
  - La vista elegida se recuerda en el teléfono.
  - Datos: `getHabitGrid(db, desde, hasta, hoy)`. `getNotebook` queda para el mes completo.
- **Bitácora con dos secciones:**
  - **Diario:** una nota por día con algo épico o algo por lo que das gracias, con la nota de hoy hasta arriba. Las notas anteriores se pueden editar, y un texto vacío borra la nota.
  - **Progreso:** las fotos y notas de las misiones, como antes.
- **Datos:** la tabla `dailyNotes` (base de datos v7), el respaldo en formato 5 (que sigue importando los anteriores) y «Restablecer progreso» también borra las notas.
- **Pruebas:** 175 pasan, con 2 nuevas de notas y 1 de flujo (Diario, Progreso y el Perfil en el menú).
- **Escenario `demo`:** ahora trae tres notas del diario.

**Sin revisar:** en una captura de RPG Pruebas salió «No se pudo generar la misión del día». La app de pruebas usa el modelo rápido; si sigue pasando, hay que ver el mensaje de error en Ajustes › Inteligencia artificial › Probar conexión.

## 8. Segunda revisión del usuario

- **Vista de 7 días con más aire:** las casillas son de 26 px (antes 36), la columna de nombres es más angosta y los renglones más bajos, así que ya no se tocan.
- **Diario como libreta-calendario:**
  - Arriba va la página del día seleccionado (hoy, por defecto): renglones y margen de libreta, la fecha como título, el texto y una foto pegada como polaroid.
  - Se puede tomar la foto con la cámara o elegirla de la galería, con la misma compresión que las evidencias. Tocarla la abre en grande, con opción de borrarla.
  - Abajo va el calendario del mes: los días con foto la muestran de fondo, los días con texto llevan una marca de tinta y hoy va resaltado. Al tocar un día se abre su página.
  - Video, todavía no.
  - Datos: `DailyNote.photo` (opcional, también en el respaldo). `saveDailyNote(db, día, { text, photo })` conserva la foto si no se manda y la quita con `null`. `getDiaryMonth` da las notas de un mes.
- **Iconos:** el destello ✨ queda solo para lo que hace la IA. La nota de hoy usa un cuaderno, el aviso de XP una estrella, el dominio de una habilidad una medalla y «Aplicar» en la revisión una palomita.
- **Pruebas:** 176 pasan (1 nueva de fotos en notas).

