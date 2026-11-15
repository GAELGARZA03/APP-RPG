# Cómo se prueba en el teléfono

En el teléfono hay **dos apps**, cada una con sus propios datos:

| App | Icono | Para qué |
|---|---|---|
| **Real Life RPG** | Verde | La del usuario, con sus datos reales. No se usa para pruebas. |
| **RPG Pruebas** | Naranja | Para probar. Aquí se cargan los escenarios. |

## Quién prueba qué

- **El usuario hace las comprobaciones en el teléfono.** Quien implementa no navega la app del teléfono para verificar (capturas, tocar pantallas, DevTools), salvo en una revisión final de versión que el usuario pida.
- **Cada función nueva se entrega con su escenario:** datos que dejan la app justo en el punto que hay que probar, más una lista corta de qué mirar. Así no se gasta ninguna llamada de IA para llegar ahí.
- Lo que se pueda comprobar con pruebas automáticas se cubre con pruebas automáticas.

## Comandos

```bash
npm run phone:pruebas        # compila e instala RPG Pruebas (conserva sus datos)
npm run phone:instalar       # compila e instala la app personal (conserva sus datos)
npm run escenario            # lista los escenarios
npm run escenario <nombre>   # carga uno en RPG Pruebas
npm run phone:llave          # copia la API key de la app personal a RPG Pruebas, sin mostrarla
npm run phone:save           # respaldo de la app personal en .respaldos/ (fuera de git)
```

Los scripts de `scripts/telefono/` actúan sobre RPG Pruebas; solo tocan la app personal con `--personal`.

## Modo ahorro de IA

En RPG Pruebas, la IA usa **solo el modelo rápido** (`gemini-3.5-flash-lite`), también para diseñar campañas y actos, para no gastar la cuota del modelo principal. Se puede cambiar en Ajustes › Inteligencia artificial › Modo ahorro (también existe en la app personal, apagado por defecto). Probar la calidad real del modelo principal es algo que el usuario pide explícitamente.

## Escenarios

`npm run escenario` los lista. Hoy existen: `demo`, `temas`, `jefe`, `acto`, `arbol`, `vacio`, `semana`, `revision`, `semana-vacia` y `libreta`.

Se definen en `src/test/buildSeed.test.ts`, armados con las funciones reales del juego, y se generan al momento con fechas relativas a hoy. Para agregar uno:

1. Agrega un `it.runIf(building)('escenario <nombre>', …)` que construya los datos y llame a `exportScenario(db, '<nombre>')`.
2. Agrega su descripción en `ESCENARIOS` de `scripts/telefono/escenario.mjs`.

Los escenarios reemplazan las tablas del juego de RPG Pruebas y conservan su configuración (llave, modelos, perfil).
