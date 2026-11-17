# Fase 3, parte 4: ruta progresiva de hábitos y recordatorios

Entrega de la parte 4 de [fase3-libreta-habitos-y-recompensas.md](fase3-libreta-habitos-y-recompensas.md). Fecha: 16 de noviembre de 2026. Nada de esto está en commit. Con esta parte se termina la fase 3.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 194 pasan: ruta, «N veces por semana», recordatorios y la llamada de la ruta |
| `npx tsc --noEmit` y `npm run build` | Sin errores |
| RPG Pruebas | Instalada con esta versión |

## 2. Qué hay de nuevo

- **Ruta progresiva** (Libreta › Ruta):
  - El jugador escribe todos los hábitos que quiere, uno por línea, con contexto opcional (horario, nivel).
  - El modelo principal (razonamiento medio; el rápido en modo ahorro) los ordena por impacto y facilidad. A cada uno le da un porqué, una frecuencia y de 2 a 4 niveles, empezando por una **versión mínima** («Leer 2 páginas» → «Leer 10 páginas» → «Leer 30 minutos»).
  - Antes de empezar, el jugador revisa la ruta y elige con cuántos arrancar: 1, 2 o 3 (la recomendación es 2 o 3). Esos se crean en la libreta en su versión mínima; el resto queda pendiente.
  - **Vista del camino:** cada paso aparece como dominado (corona), en formación (con su nivel y su constancia) o pendiente (candado). Hay botones para «Empezar ya el siguiente», «Rehacer la ruta» (los hábitos activos se quedan) y «Borrar la ruta» (los hábitos se quedan en la libreta, sin niveles).
  - **Sugerencias** (arriba de la libreta y en la ruta):
    - Con constancia alta, propone «Subir de nivel» (cambia el nombre del hábito al siguiente nivel) o «Sumar el siguiente».
    - En el nivel más alto, propone «Dominado».
    - Con constancia baja, propone «Bajar un nivel».
    - «Ahora no» pospone la sugerencia una semana.
    - **Nunca cambia nada sin que el jugador acepte.**
  - En la app, una frase explica la idea sin prometer un número mágico de días: «La ruta avanza según tu constancia real».
- **«N veces por semana»** (de 1 a 6), como tercera opción de frecuencia:
  - En la libreta se puede marcar cualquier día.
  - El cumplimiento compara lo hecho contra N por cada 7 días.
  - La racha cuenta las **semanas** seguidas en que llegó a la meta. La semana en curso suma si ya llegó y, si todavía no, no rompe la racha.
  - En «Hábitos de hoy» se ve «2/3 esta semana».
- **Recordatorio por hábito:**
  - En el formulario del hábito se elige una hora opcional.
  - Se programan avisos para los próximos 7 días en que toca. Se saltan los días ya marcados y, en los de «N veces por semana», el resto de la semana una vez cumplida la meta.
  - Al marcar el hábito, el aviso de ese día se cancela solo: la app reprograma cada vez que cambia un hábito o su registro.
  - Si el permiso de notificaciones no se ha pedido, se pide la primera vez que hay un recordatorio. Usa el mismo canal y los mismos ajustes de alarma exacta que los recordatorios fijos.

## 3. Regla de constancia (y por qué)

- **Constancia** = lo hecho entre lo esperado en los días programados de las **últimas 2 semanas, sin hoy**, contando solo desde que el hábito llegó a su nivel actual. «A medias» vale 0.5.
- **Mínimo 7 días programados** en el nivel antes de opinar: con menos datos, cualquier sugerencia sería ruido. Por eso, al subir o bajar de nivel, la medición vuelve a empezar.
- **80 % o más:** el hábito ya es estable (en 14 días permite fallar 2 o 3 sin perder la sugerencia).
- **Menos de 50 %:** se está cayendo más de la mitad de las veces. En ese caso conviene hacerlo más fácil antes que sumar algo nuevo, y por eso no se ofrece agregar más.
- Los umbrales están en `src/data/store/route.ts` (`ROUTE_HIGH`, `ROUTE_LOW`, `ROUTE_MIN_DAYS`, `ROUTE_WINDOW_DAYS`) por si se quieren ajustar.

## 4. Decisiones

- **El nombre del hábito es el texto de su nivel** («Leer 10 páginas»): así la libreta y Hoy dicen exactamente qué hacer. El nombre general («Lectura») vive en la ruta.
- **Dificultad 1** para los hábitos de la ruta: su versión mínima es pequeña a propósito.
- **Un premio por racha** de un hábito de «N veces por semana» compara contra su racha en semanas.
- **Base de datos v10:** tabla `routeItems`. Los hábitos ganan `reminder`, `routeItemId`, `level` y `levelSince`.
- **Respaldo formato 8:** sigue importando los anteriores.
- **Ids de los recordatorios:** de 1000 a 1999, separados de los recordatorios fijos (1 a 4) y de la notificación de prueba.

## 5. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/data/store/route.ts` | Constancia, sugerencias, iniciar, aceptar, posponer y borrar la ruta |
| `src/ai/gemini/route.ts`, `src/ai/habitRoute.ts` | La llamada que diseña la ruta |
| `src/ui/route/` | `RouteScreen` (crear, vista previa, camino) y `RouteOfferCard` |
| `src/data/store/habits.ts` | «N veces por semana» (`weekCount`, racha semanal) y `getReminderPlan` |
| `src/platform/notifications.ts` | `scheduleHabitReminders` |
| `src/data/route.test.ts` | Pruebas de la ruta, la frecuencia semanal y los recordatorios |

## 6. Cómo probar (RPG Pruebas)

```bash
npm run escenario ruta
```

1. Libreta: arriba aparecen dos sugerencias, «Lectura» (subir de nivel o sumar el siguiente) y «Agua» (bajar un nivel). Acepta una y prueba «Ahora no» en la otra.
2. Libreta › Ruta: el camino con pasos en formación y pendientes, y «Empezar ya el siguiente».
3. «Hábitos de hoy»: el gimnasio dice cuántas veces lleva esta semana.
4. Edita un hábito, ponle un recordatorio dentro de 2 o 3 minutos y espera el aviso. Luego ponle otro, marca el hábito antes de la hora y comprueba que ya no llega.
5. Para crear una ruta real: Libreta › Ruta › «Rehacer la ruta» o «Borrar la ruta», escribe varios hábitos y toca «Armar mi ruta» (1 llamada; en la app de pruebas, con el modelo rápido).

## 7. Sin verificar

- Nada se revisó en el teléfono; lo prueba el usuario.
- La llamada real que arma la ruta solo se probó con Gemini simulado.
- Que lleguen los recordatorios a su hora (y que se cancelen) solo se puede comprobar en el teléfono, con un recordatorio cercano.
