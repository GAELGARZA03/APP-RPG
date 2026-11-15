# Fase 3, parte 3: misiones del día, oro, tienda y racha por campaña

Entrega de la parte 3 de [fase3-libreta-habitos-y-recompensas.md](fase3-libreta-habitos-y-recompensas.md). Fecha: 15 de noviembre de 2026. Nada de esto está en commit.

## 1. Estado

| Qué | Estado |
|---|---|
| Pruebas (`npm test`) | 187 pasan (eran 180): 6 de tienda, oro y racha por campaña, y 1 de flujo de la tienda |
| `npx tsc --noEmit` y `npm run build` | Sin errores |
| RPG Pruebas | Instalada con esta versión |

## 2. Qué hay de nuevo

- **Tres misiones del día** (Hoy):
  - Una sola llamada al modelo rápido al abrir la app en un día nuevo genera tres retos de 15 a 30 minutos: uno de la **campaña** (el acto actual), uno de un **hábito** o habilidad y uno **libre** (bienestar, curiosidad, conexión).
  - Sin campañas, se basan en los hábitos y las habilidades; sin nada de eso, no aparecen.
  - Mismas reglas que antes: 50 % más de XP (con el bono de racha), cuentan para la racha general y caducan a las 4:00 a. m.
  - Si la llamada falla, la tarjeta ofrece «Toca para reintentar».
  - Cada misión muestra su tipo (Campaña, Hábito o Reto libre), el tiempo y el XP.
- **Oro:**
  - Se gana 1 de oro por cada 10 XP (en misiones de campaña, jefe, misiones del día y hábitos hechos o a medias), más **20 de oro por cada acto cerrado** (también el último, al derrotar al jefe).
  - El oro se calcula a partir del XP y los canjes, así que deshacer una misión o un hábito devuelve su oro.
  - El HUD de Hoy muestra el oro; al tocarlo se abre la tienda. El aviso de XP dice también cuánto oro ganaste.
- **Tienda** (menú del logotipo › Tienda, o el oro del HUD):
  - El jugador crea sus premios con emoji, nombre, precio y si se pueden canjear varias veces. Con la tienda vacía se ofrecen ejemplos de un toque.
  - «Canjear» pide confirmación, descuenta el oro y muestra una animación con vibración y sonido. Si no alcanza, el botón dice cuánto falta.
  - Hay historial de canjes, y cada canje aparece como hito en Bitácora › Progreso.
  - Un premio se puede editar o quitar de la tienda; su historial se conserva.
- **Premios por meta** («Premio por meta» en la tienda):
  - Se atan a terminar una campaña, cerrar un acto, completar una misión o lograr una racha de un hábito (por ejemplo, «7 días seguidos: Leer»).
  - En la tienda se ve su avance («3 de 7 días», «2 de 4 misiones»).
  - Al cumplirse, sale el aviso «¡Ganaste tu premio!» con vibración y botón a la tienda, y el premio queda listo para canjear gratis. También aparece como hito.
  - Se revisan después de cada logro y al abrir la app.
- **Racha por campaña:** son los días seguidos con avance en la campaña (una misión completada o saltada, o una misión del día de esa campaña). Se ve en su tarjeta en Misiones («🔥 3 días seguidos avanzando») y en el encabezado de su mapa.

## 3. Decisiones

- **Oro calculado, no guardado** (`getWallet` en `src/data/store/shop.ts`): ganado = XP ÷ 10 por evento + 20 por acto cerrado; gastado = suma de canjes. Así nunca se desincroniza. El XP que ya tenías también cuenta, así que empiezas con el oro de todo lo que has hecho.
- **Precios sugeridos:** en un día activo se ganan entre 20 y 60 de oro; por eso los ejemplos van de 60 (un capítulo) a 1,500 (algo que quieres comprar).
- **Premios por meta:** precio 0, de una sola vez. Al cumplirse se guarda `earnedDay` y el premio sigue ganado aunque después se deshaga algo.
- **Misiones del día:** el `id` pasa a ser `día#número` y se guardan `day`, `slot` y `kind`. La misión del día anterior a la base de datos v9 queda como la número 1 de su día.
- **Base de datos v9:** índice de `dailies` por día y tablas nuevas `rewards` y `redemptions`.
- **Respaldo formato 7:** incluye premios y canjes. Los respaldos anteriores convierten su misión del día.
- **Color del oro:** el token nuevo `--color-gold` es igual en los cinco temas, porque todos son oscuros.
- **Atar un premio desde la tienda:** se elige la campaña, el acto, la misión o el hábito en un selector; no se hace desde el mapa.

## 4. Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `src/data/store/daily.ts` | Tres misiones por día (`getDailies`, `saveDailies`) |
| `src/ai/gemini/calls.ts` (`generateDailies`), `prompts.ts`, `jsonSchemas.ts`, `validation.ts` | La llamada única con las tres misiones |
| `src/data/store/shop.ts` | Oro, premios, canjes, premios por meta y racha por campaña |
| `src/ui/DailyCard.tsx` | Tarjeta de las tres misiones |
| `src/ui/shop/` | `ShopScreen` y `RewardSheet` |
| `src/data/shop.test.ts` | Pruebas de oro, tienda, metas y racha por campaña |

## 5. Cómo probar (RPG Pruebas)

```bash
npm run escenario demo
```

1. Hoy: las tres misiones del día (del escenario) y el oro en el HUD. Completa una: el aviso dice «+XP · +oro».
2. Toca el oro: la tienda con tres premios, un canje en el historial y la meta «Ir al cine» (7 días seguidos de agua) con su avance.
3. Canjea el capítulo de tu serie; luego crea un premio nuevo y un premio por meta.
4. Deshaz la misión que completaste: el oro baja.
5. Misiones: la racha de la campaña de guitarra en su tarjeta y en su mapa.
6. Bitácora › Progreso: el canje aparece como hito.

```bash
npm run escenario vacio
```

Abre la tienda vacía para ver los ejemplos. Para generar misiones del día reales (1 llamada al modelo rápido), crea primero un hábito o carga el escenario `libreta` y espera al día siguiente, o usa «Toca para reintentar».

## 6. Sin verificar

- Nada se revisó en el teléfono; lo prueba el usuario.
- La generación real de las tres misiones solo se probó con Gemini simulado. La primera llamada real será la del primer día con la versión nueva.
