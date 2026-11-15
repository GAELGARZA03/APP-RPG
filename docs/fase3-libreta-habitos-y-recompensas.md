# Fase 3: libreta de hábitos, bitácora y recompensas

Especificación dividida en **cuatro partes independientes**, para implementarlas en sesiones separadas. Cada sesión hace **una sola parte**. Lee completas la sección común (1 a 4) y la parte que te toca. Donde algo no esté definido, decide con criterio, aplícalo y anótalo en el reporte de la parte.

**Requisito:** la fase 2 ([fase2-verificacion-y-revision-semanal.md](fase2-verificacion-y-revision-semanal.md)) debe estar terminada antes de la parte 1, porque reorganiza la capa de datos y la de IA. Si al empezar ves que no lo está, avísale al usuario antes de seguir. Lee también los reportes de entrega de las fases anteriores (`docs/fase1-entrega.md` y `docs/fase2-entrega.md`).

---

## 1. Por qué existe esta fase

El usuario usaba una **libreta física** (bullet journal) para llevar su vida mes a mes y la dejó. Quiere tenerla en la app, unida al juego:

- **A la izquierda**, los días del mes, cada uno con algo memorable o épico que hizo ese día ("Conocí a tal famoso").
- **En medio**, una cuadrícula de hábitos: un renglón por día y una columna por hábito, marcando si lo hizo, si lo hizo a medias o si no lo hizo.
- **A la derecha**, las horas que durmió cada noche, dibujadas como una gráfica de línea a lo largo del mes.

Las referencias están en `docs/referencias/libreta-1.webp` y `docs/referencias/libreta-2.png` (fuera de git).

Además, el usuario no está contento con los **contratos diarios** actuales: hay que crearlos a mano y se sienten estáticos. Quiere:

1. Que los **hábitos** vivan en la libreta, con su propia racha.
2. Que la pestaña Hoy tenga **tres misiones del día** generadas solas cada día, en lugar de los contratos.
3. **Rachas** en dos niveles: una general ("avanzaste en tu vida hoy") y una por cada hábito y cada campaña ("llevas 12 días aprendiendo mentalismo").
4. Una **bitácora** que reúna su diario de momentos épicos y las evidencias de sus misiones.
5. **Recompensas reales:** oro por cada logro y una tienda de premios que él define ("pizza = 400 de oro"), más premios atados a metas concretas.
6. Una **ruta progresiva de hábitos:** escribe los hábitos que quiere y la app los introduce poco a poco, empezando por pocos y en versión mínima, en lugar de todos de golpe.

---

## 2. Reglas comunes a todas las partes

### Hábitos

- Reemplazan a los contratos diarios. Cada hábito tiene nombre, un icono o emoji opcional, dificultad (1 a 5, por defecto 1), frecuencia y fecha de creación. Se pueden archivar sin perder su historial.
- **Frecuencia:** diaria o ciertos días de la semana (parte 1). La parte 4 agrega "N veces por semana".
- **Registro por día**, con cuatro estados: sin registrar, **hecho**, **a medias** y **no hecho**. Marcar debe ser rápido, de un toque para el caso común.
- **XP y oro:** hecho da el XP de su dificultad; a medias, la mitad. El bono de racha se aplica como hoy.
- **Días anteriores:** hoy y ayer cuentan para XP, oro y racha. Los días más viejos del mes se pueden corregir solo como registro, sin XP ni oro, para que la libreta sea honesta sin poder inflar el juego.
- El día de juego sigue cerrando a las 4:00 a. m.

### Rachas

- **Racha general:** un día cuenta si el jugador completó al menos una misión (de campaña o del día) o registró al menos un hábito como hecho o a medias. Fallar un día la reduce a la mitad, como la regla actual. Sustituye a la racha de contratos.
- **Bono de racha:** +5% de XP por día de racha general, hasta +50%, sobre los hábitos y las misiones del día.
- **Racha por hábito:** días programados consecutivos con el hábito hecho o a medias. Los días no programados no la rompen.
- **Racha por campaña** (parte 3): días consecutivos con algún avance en esa campaña.

### Migración de los contratos actuales

El teléfono del usuario tiene 9 contratos diarios reales. En la parte 1 se convierten en **hábitos diarios**, con su historial de días cumplidos como "hecho" y todo su XP. Nada se pierde.

### Navegación

Máximo **cinco pestañas** abajo: **Hoy, Misiones, Libreta, Bitácora y Perfil**. El logotipo de arriba a la izquierda abre un **menú lateral** con lo que no necesita pestaña: **Ajustes** (con todas sus secciones actuales), **Tienda** (desde la parte 3), Reglas del juego y Acerca de. El botón atrás de Android cierra el menú antes que nada.

---

## 3. Restricciones comunes

- **No hagas commit.** El usuario hace sus commits.
- **Datos del usuario:** antes de probar con datos de demostración, ejecuta `npm run phone:save`. Al terminar, restaura su respaldo **pasándolo por la importación de la app**, para que se le aplique la migración de la parte en curso. Comprueba que sus datos reales siguen ahí. No uses `pm clear`.
- **Cuota de Gemini:** como máximo unas 8 llamadas reales al modelo principal por parte. Para lo demás, usa Gemini simulado.
- **Seguridad:** nunca imprimas la API key.
- **Respaldo:** cada dato nuevo entra en el respaldo JSON, con un formato nuevo que siga importando los anteriores. Agrega pruebas.
- **Diseño:** usa el kit de `src/ui/kit`, los tokens de color (que funcionen con los cinco temas), animaciones con Motion que respeten la reducción de movimiento, y botón atrás por capas. La libreta debe recordar a una libreta (por ejemplo, un fondo de puntos sutil o detalles de papel), pero dentro de la identidad visual actual, no como una foto de papel.
- **Calidad:** al terminar deben pasar `npm test`, `npm run test:flow`, `npx tsc --noEmit` y `npm run build`, y la parte debe estar instalada y probada en el teléfono.

---

## 4. Cómo entregar cada parte

Al terminar una parte:

1. Escribe `docs/fase3-parteN-entrega.md` (donde N es el número de la parte) con el formato de `fase1-entrega.md`: estado, qué hay de nuevo, decisiones, dónde está cada cosa, cómo probar, qué se verificó y qué no, y problemas conocidos.
2. Actualiza `ROADMAP.md`.
3. Dale al usuario un resumen corto en español.

---

## Parte 1: navegación y libreta de hábitos

### Qué construir

1. **Navegación nueva:** las cinco pestañas de la sección 2 y el menú lateral desde el logotipo, con Ajustes adentro. La pestaña **Bitácora** muestra por ahora la bitácora de evidencias que hoy está en el Perfil (la parte 2 la amplía).
2. **Hábitos:** crear, editar, archivar y reordenar, con frecuencia diaria o por días de la semana, y la migración de los contratos actuales.
3. **Libreta mensual** (pestaña Libreta):
   - Selector de mes, con el actual por defecto.
   - **Cuadrícula de hábitos:** un renglón por día y una columna por hábito, con los cuatro estados distinguibles a simple vista (no solo por color). La columna de días queda fija al desplazarse de lado cuando hay muchos hábitos. El día de hoy se resalta. Los días no programados para un hábito se ven distintos.
   - Al pie de cada columna, el cumplimiento del mes del hábito; y por hábito, su racha.
   - Debe caber y leerse bien en un teléfono en vertical, con 3 hábitos o con 12.
4. **Hoy:** desaparece "Contratos de hoy". En su lugar, un bloque compacto **"Hábitos de hoy"** con los hábitos programados para hoy y marcado de un toque, que lleva a la libreta. La misión del día actual se queda como está (la parte 3 la cambia).
5. **Rachas:** la racha general (sección 2) sustituye a la de contratos en el HUD y en la fila semanal de días. Cada hábito muestra su propia racha.
6. **Generador de campañas:** donde hoy sugiere contratos diarios, ahora sugiere **hábitos**, que al aceptarse se agregan a la libreta.
7. **Revisión semanal (de la fase 2):** analiza el cumplimiento de los hábitos en lugar del de los contratos, y sus ajustes proponen archivar, agregar o cambiar la frecuencia de un hábito. Las revisiones ya guardadas se siguen viendo bien.

### Criterios de aceptación

- [ ] Cinco pestañas y menú lateral desde el logotipo, con Ajustes adentro; el botón atrás cierra el menú.
- [ ] Los 9 contratos del usuario se convirtieron en hábitos con su historial y su XP.
- [ ] La libreta muestra el mes como cuadrícula de hábitos, con cuatro estados, días no programados, hoy resaltado, cumplimiento y racha por hábito; se lee bien con 3 y con 12 hábitos.
- [ ] Hoy muestra "Hábitos de hoy" y ya no muestra contratos.
- [ ] Hoy y ayer dan XP y cuentan para la racha; los días anteriores solo se registran.
- [ ] La racha general y la racha por hábito funcionan como dice la sección 2, con pruebas.
- [ ] El generador sugiere hábitos en lugar de contratos.
- [ ] La revisión semanal usa hábitos en lugar de contratos.

---

## Parte 2: diario, bitácora unificada y sueño

### Qué construir

1. **Momentos (diario):** registrar algo memorable de un día, con fecha (hoy por defecto, editable), título corto, texto opcional, foto opcional (con la misma compresión de la bitácora) y una etiqueta: logro, persona, viaje, primera vez u otro. Puede haber varios por día.
2. **Columna de momentos en la libreta:** junto a la cuadrícula, cada día muestra el título de su momento (o del primero, con un indicador si hay más). Tocarlo abre el momento; tocar un día vacío permite agregar uno.
3. **Bitácora unificada** (pestaña Bitácora): una línea de tiempo que mezcla **momentos**, **evidencias de misiones** (con su campaña y misión) e **hitos automáticos** (subiste de nivel, cerraste un acto, derrotaste un jefe, dominaste una habilidad). Con filtros: Todo, Momentos y Misiones. Los hitos automáticos no se editan.
4. **"Hace un año":** si existe un momento de la misma fecha de un año anterior (o del mismo día de un mes anterior, si no hay de hace un año), Hoy lo muestra como recuerdo, discretamente.
5. **Sueño:**
   - Registro de las horas dormidas cada noche, de 0 a 14 en pasos de media hora. Debe ser rápido: al abrir la app en un día nuevo, Hoy ofrece "¿Cuánto dormiste?", con opción de saltarlo.
   - En la libreta, una columna o panel con la **gráfica de línea del mes**, alineada con los días, el promedio y una meta opcional de horas (por ejemplo, una línea de referencia de 8 horas).
   - El sueño no da XP ni oro: es solo registro.

### Criterios de aceptación

- [ ] Los momentos se crean, editan y borran, con foto y etiqueta, y aparecen junto a su día en la libreta.
- [ ] La bitácora mezcla momentos, evidencias e hitos automáticos, con filtros.
- [ ] "Hace un año" aparece en Hoy cuando hay un recuerdo.
- [ ] Las horas de sueño se registran rápido y se ven como gráfica del mes, con promedio y meta opcional.
- [ ] Momentos y sueño entran en el respaldo.

---

## Parte 3: misiones del día, oro, tienda y racha por campaña

### Qué construir

1. **Tres misiones del día:** al abrir la app por primera vez en un día de juego, el **modelo rápido** genera **tres** retos pequeños (de 15 a 30 minutos) en **una sola llamada**, variados entre sí. Por ejemplo: uno del acto actual de una campaña, uno ligado a un hábito o habilidad, y uno libre de bienestar o curiosidad. Si no hay campañas, se basan en los hábitos. Sustituyen a la misión del día única actual, con las mismas reglas: dan 50% más de XP, cuentan para la racha general al completarse, no la rompen si no se hacen y caducan a las 4:00 a. m. Si la llamada falla, no se ve nada roto y se puede reintentar.
2. **Oro:** una segunda moneda que se gana en cada logro: misiones de campaña, jefe, misiones del día, hábitos (hecho o a medias) y un bono al cerrar un acto. Decide una proporción razonable respecto al XP y explícala. Deshacer devuelve el oro. Se ve en el HUD, y tocarlo abre la tienda.
3. **Tienda** (desde el menú lateral y desde el oro del HUD):
   - El usuario crea sus **premios reales** con nombre, emoji o icono, precio en oro y si se pueden canjear varias veces o una sola.
   - Botón **"Canjear"**, con confirmación y una animación satisfactoria; descuenta el oro y queda en un historial de canjes. Cada canje también aparece en la bitácora como hito.
   - Con pocos o ningún premio, la tienda ofrece ejemplos para crear rápido.
4. **Premio por meta:** a una campaña, a un acto, a una misión o a una racha de un hábito (por ejemplo, "7 días seguidos leyendo") se le puede atar un premio libre: "Si termino el libro esta semana, pizza". Al cumplirse, aviso y vibración ("¡Ganaste tu pizza!"), y el premio queda como **ganado** en la tienda, listo para canjear sin costo.
5. **Racha por campaña:** cada campaña muestra los días seguidos con avance, en su tarjeta y en su mapa.

### Criterios de aceptación

- [ ] Hoy muestra tres misiones del día, generadas en una sola llamada al abrir un día nuevo, variadas y con las reglas de la misión del día actual.
- [ ] El oro se gana y se devuelve al deshacer, y se ve en el HUD.
- [ ] La tienda permite crear premios, canjearlos con confirmación y ver el historial; los canjes aparecen en la bitácora.
- [ ] Los premios por meta se otorgan al cumplirse la condición y quedan listos para canjear.
- [ ] Cada campaña muestra su racha.
- [ ] Oro, premios, canjes y misiones del día entran en el respaldo.

---

## Parte 4: ruta progresiva de hábitos y recordatorios

### Qué construir

1. **Ruta progresiva:**
   - El usuario escribe los hábitos que quiere tener, los que sean (por ejemplo, 10), con contexto opcional (horario, nivel actual).
   - El **modelo principal** arma la ruta: los ordena por impacto y facilidad; da a cada uno una **versión mínima** y niveles para crecer (por ejemplo: leer 2 páginas → 10 páginas → 30 minutos), una frecuencia sugerida y por qué importa. Solo los **2 o 3 primeros** empiezan activos en la libreta.
   - **Regla de estabilidad:** cuando un hábito activo llega a una constancia alta sostenida (por ejemplo, 80% de sus días programados en las últimas dos semanas, con "a medias" contando la mitad), la app **ofrece** agregar el siguiente de la ruta o subir de nivel el actual. Si la constancia cae por debajo de un umbral bajo, ofrece bajarle el nivel en vez de agregar más. **Nunca cambia nada sin que el usuario lo acepte.** Ajusta los umbrales con criterio y explícalos.
   - **Vista de la ruta:** un camino con los hábitos dominados, en formación y pendientes, coherente con el estilo del mapa de campaña.
   - Explica la idea en la app con una frase, sin prometer un número mágico de días: la ruta avanza según la constancia real del usuario.
2. **Frecuencia "N veces por semana"** para los hábitos, con su efecto en la cuadrícula, en el cumplimiento y en la racha por hábito.
3. **Recordatorio por hábito:** una hora opcional por hábito, que se programa según su frecuencia con las notificaciones locales que ya existen. Si el hábito ya está marcado ese día, el recordatorio de ese día se cancela. Respeta los permisos y los ajustes de batería de Samsung que la app ya maneja.

### Criterios de aceptación

- [ ] El usuario escribe sus hábitos deseados y obtiene una ruta con versiones mínimas, niveles y un orden razonado; solo 2 o 3 empiezan activos.
- [ ] La app ofrece avanzar, subir o bajar de nivel según la constancia, siempre con confirmación, con pruebas de la regla.
- [ ] La vista de la ruta muestra dominados, en formación y pendientes.
- [ ] La frecuencia "N veces por semana" funciona en la libreta, el cumplimiento y la racha.
- [ ] Los recordatorios por hábito llegan a su hora y se cancelan si el hábito ya está marcado (comprobado en el teléfono con un recordatorio cercano).
- [ ] La ruta y los recordatorios entran en el respaldo.
