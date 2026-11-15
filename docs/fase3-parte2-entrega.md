# Fase 3, parte 2: diario, bitácora unificada y sueño

Entrega de la parte 2 de [fase3-libreta-habitos-y-recompensas.md](fase3-libreta-habitos-y-recompensas.md). Fecha: 15 de noviembre de 2026. Nada de esto está en commit. Antes de esta parte, la parte 1 ya había creado el diario (una nota por día, con foto) y la Bitácora con dos secciones; ver [fase3-parte1-entrega.md](fase3-parte1-entrega.md), secciones 7 y 8.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 180 pasan: sueño, hitos, recuerdos y hábitos archivados |
| `npx tsc --noEmit` y `npm run build` | Sin errores. Paquete inicial: 537 KB (162 KB comprimido) |
| RPG Pruebas | Instalada con esta versión |

## 2. Corrección previa: hábitos archivados

En la app personal, la libreta mostraba en 7 días y en el mes los contratos que ya estaban archivados (atenuados y con casillas solo en los días en que existían). Por eso parecía que no se podía tocar nada. Ahora:

- La libreta solo muestra los hábitos activos.
- Libreta › Hábitos tiene una sección plegable «Archivados» con el botón «Restaurar». El hábito regresa con todo su historial, al final de la libreta.

## 3. Qué hay de nuevo

- **Sueño:**
  - En Hoy, la tarjeta «¿Cuánto dormiste anoche?» tiene un selector de media en media hora y los botones «Guardar» y «Saltar». Propone las horas de la noche anterior. Después de guardar queda una línea discreta («Dormiste 7 h 30 min») que se puede tocar para corregir.
  - En la Libreta, debajo de los hábitos, hay una gráfica de línea del periodo visible (3 días, 7 días o mes), con la meta de 8 horas punteada y el promedio. Al tocar un día se abre un editor para registrar o borrar sus horas.
  - No da XP ni cuenta para la racha.
  - Las horas se guardan en el día en que despertaste (la noche anterior).
- **Hitos automáticos en Bitácora › Progreso:** subiste de nivel, cerraste un acto, derrotaste un jefe y nueva etapa de dominio de una habilidad. Aparecen junto a las evidencias de cada día, con los filtros Todo, Evidencias e Hitos. Se calculan a partir de los datos, así que deshacer una misión también quita su hito.
- **Recuerdo en Hoy:** si hay una nota del mismo día de hace un año (o, si no, de hace un mes), Hoy la muestra discretamente. Al tocarla se abre esa página del diario.
- **Fila «Diario» en la libreta:** arriba de los hábitos, cada día con nota lleva su marca o la miniatura de su foto. Al tocar un día se abre su página en la Bitácora.

## 4. Decisiones

- **Una nota por día** (con foto opcional) en lugar de varios momentos con etiqueta: es lo que el usuario pidió al ver la parte 1. Si después se quieren varios, se puede extender `DailyNote`.
- **Meta de sueño fija de 8 horas**, por ahora sin ajuste.
- **Base de datos v8:** tabla `sleep`. **Respaldo formato 6:** sigue importando los anteriores.
- **«Saltar» el sueño** se recuerda solo ese día y en ese teléfono (`localStorage`).
- **Recuerdo:** si el mes anterior es más corto (por ejemplo, el 31 de marzo), no hay «mismo día» y no se muestra.

## 5. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/data/store/sleep.ts` | Registrar y leer horas, promedio del periodo |
| `src/data/store/milestones.ts` | Hitos calculados |
| `src/data/store/notes.ts` | Notas, rango para la libreta y recuerdo (`getMemory`) |
| `src/ui/sleep/` | `SleepCard` (Hoy), `SleepChart` (Libreta), `SleepStepper` |
| `src/ui/MemoryCard.tsx` | Recuerdo en Hoy |
| `src/ui/Journal.tsx` | Progreso con hitos y filtros |

## 6. Cómo probar (RPG Pruebas)

```bash
npm run escenario demo
```

1. Hoy: la tarjeta de sueño (guarda o salta) y el recuerdo de hace un mes (si el día existe). Toca el recuerdo: abre esa página del diario.
2. Libreta: la fila «Diario» con marcas y la gráfica de sueño de 14 días. Toca un día de la gráfica y cambia sus horas.
3. Bitácora › Progreso: los hitos (niveles, el acto cerrado y el jefe derrotado) junto a las evidencias; prueba los filtros.
4. Libreta › Hábitos: archiva uno y restáuralo desde «Archivados».

```bash
npm run escenario libreta
```

Revisa la gráfica de sueño del mes con 12 hábitos.

## 7. Sin verificar

- Nada se revisó en el teléfono; lo prueba el usuario.
- La gráfica de sueño solo se probó en las pruebas automáticas y al compilar; falta verla con los cinco temas.
