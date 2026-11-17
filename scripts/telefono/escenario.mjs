// Carga en "RPG Pruebas" los datos exactos para probar algo, sin gastar llamadas de IA.
//
//   npm run escenario <nombre>
//
// Los escenarios se generan al momento con las funciones reales del juego (src/test/buildSeed.test.ts),
// así que las fechas siempre quedan relativas a hoy. Reemplazan los datos del juego de la app de pruebas;
// tu app personal no se toca.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { APPS } from './app.mjs'
import { load } from './volcado.mjs'

const ESCENARIOS = {
  demo: 'Algo de todo: campaña a medias, otra completada, hábitos con racha, misión del día, notas del diario, sueño y un recuerdo de hace un mes.',
  temas: 'La demo con nivel 14: todos los temas, títulos y sonidos desbloqueados (Perfil).',
  jefe: 'Solo falta el jefe de «El lector de medianoche»: pide foto o nota y da el doble de XP.',
  acto: 'Al Acto 1 de guitarra le queda una misión: complétala para ver la celebración y «Generar Acto 2».',
  arbol: 'Árbol de habilidades enorme (78 habilidades en 6 áreas), nivel alto.',
  vacio: 'Juego en cero, como recién instalado.',
  semana: 'Semana pasada variada y sin revisar: abre «Tu revisión semanal» en Hoy (1 llamada al modelo rápido).',
  revision: 'La misma semana con la revisión ya hecha: prueba «Aplicar» y «Descartar» sin gastar llamadas.',
  libreta:
    'Libreta con 12 hábitos y el mes registrado (hecho, a medias, no hecho): cuadrícula, cumplimiento, rachas y la gráfica de sueño.',
  ruta: 'Ruta de hábitos a mitad de camino: una sugerencia de subir, otra de bajar, un hábito de 3 veces por semana con recordatorio y pasos pendientes.',
  'semana-vacia': 'La semana pasada no hubo actividad: Hoy muestra «Semana tranquila» sin llamar a la IA.',
}

const name = process.argv[2]
if (!ESCENARIOS[name]) {
  console.log('Uso: npm run escenario <nombre>\n')
  for (const [key, description] of Object.entries(ESCENARIOS)) console.log(`  ${key.padEnd(13)} ${description}`)
  process.exit(name ? 1 : 0)
}

console.log(`Preparando el escenario «${name}»…`)
execSync(`npx vitest run src/test/buildSeed.test.ts -t "escenario ${name}$"`, {
  env: { ...process.env, SEED_BUILD: '1' },
  stdio: 'pipe',
})
const data = JSON.parse(readFileSync(`scripts/telefono/escenarios/${name}.json`, 'utf8'))
const { after } = await load(APPS.pruebas, data)
console.log(`✔ Cargado en RPG Pruebas: ${after}`)
console.log(`  ${ESCENARIOS[name]}`)
