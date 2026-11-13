# Real Life RPG: ideas y pendientes

## Hecho

- **Vista de detalle de misiones:** al tocar una misión, la tarjeta crece hasta ocupar la pantalla, con descripción, objetivos, dificultad, XP y botones para completar o editar.
- **Misiones más concretas:** Gemini escribe descripción y objetivos medibles ("Practica el swing cut 10 veces"). Las misiones antiguas se pueden detallar con el botón "Detallar con IA".
- **Generador de IA:** cuadro de texto sin la esquina para cambiar el tamaño, que crece solo, y ejemplos tocables.
- **Respuesta a los toques:** el HUD abre Perfil, la racha explica sus reglas y las filas abren el detalle.
- **Ajustes:** perfil con foto y nombre, y menú de secciones que se abren en su propia hoja.
- **Campañas plegables:** cerradas por defecto; se abren al tocar su nombre.
- **Icono propio y logotipo:** emblema hexagonal con flechas de "subir de nivel", también en la pantalla de inicio de la app. Incluye versión monocroma para los iconos temáticos de Android 13+.

- **Fase 1: campañas con progresión y árbol de habilidades.** Preguntas antes de generar, análisis de la meta, actos que se desbloquean, misión jefe, generación acto por acto, mapa de campaña tipo videojuego, objetivos marcables, bitácora de evidencias con fotos, misión del día, vibración, modelo según la tarea (Gemini 4 Hydrogen para diseñar) y árbol de habilidades en el Perfil. Especificación en [docs/fase1-progresion-y-arbol.md](docs/fase1-progresion-y-arbol.md). Pruebas del flujo completo con `npm run test:flow`. Resumen de lo construido y cómo retomarlo en [docs/fase1-entrega.md](docs/fase1-entrega.md).
- **Estado y cuota de modelos:** tarjeta en Ajustes con las llamadas restantes por modelo, ajuste manual y verificación bajo demanda.
- **Llamadas a la IA más resistentes:** reintentos automáticos ante saturación o límite de frecuencia, modelo de respaldo y mensajes claros en cada etapa.
- **Restablecer progreso y limpieza:** opción en Ajustes para dejar el juego en cero; borrar una campaña se lleva sus misiones, evidencias, su rama del árbol y sus contratos; las campañas terminadas se agrupan en «Completadas». Datos de prueba por USB con `npm run phone:demo`.

## Siguiente

- **Restablecer conservando lo ganado:** una variante que borre misiones y campañas pero conserve XP, nivel y desbloqueos.
- **Pendientes de la Fase 1:** probar en el teléfono la foto de evidencia de principio a fin y la misión jefe real; revisar las pantallas nuevas con los cinco temas; editar las misiones de un acto antes de aceptarlas (hoy se editan después, una por una).
- **Revisión semanal con IA:** análisis de lo que completaste y lo que se atoró, con ajustes sugeridos.
- **Logros:** pensar cómo generarlos (por ejemplo, con IA a partir de lo que haces) en lugar de una lista fija.
- **Widget de Android** con los contratos de hoy.
- **Video en la bitácora** y un **mentor** con IA para dudas de cada misión (por decidir).

- **Fechas límite y recordatorios por tarea:** por ejemplo, "Vence el 8 de noviembre" o "Recuérdame a las 9:00". Si se vence, aviso al día siguiente, sin quitar XP. Se mostrará en la vista de detalle.
- **Icono para Android 7 (opcional):** los teléfonos con Android 7 todavía usarían el icono antiguo de Capacitor en PNG. No afecta al Samsung actual.
- **Nombre definitivo de la app** (si se cambia "Real Life RPG").

## Futuro

- **Aspecto más premium:** pulir detalles, animaciones e ilustraciones propias.
- **Social, estilo consola:**
  - Agregar amigos y ver su actividad ("Gael completó la campaña X", "subió al nivel 5").
  - Una mini red social para publicar logros.
  - Competir con amigos (rachas, XP de la semana).
  - Requiere un servidor y cuentas de usuario. Hoy la app guarda todo solo en el teléfono, así que esto implica decidir dónde vivirían los datos compartidos y qué se comparte.
