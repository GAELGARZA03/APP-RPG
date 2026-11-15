// Guarda y carga los datos del juego por USB, sin tocar la pantalla.
// Funciona con las apps de desarrollo (personal y pruebas), que permiten depurar la WebView.
//
//   node scripts/telefono/datos.mjs guardar [archivo] [--personal]   copia TODO a un archivo (por defecto .respaldos/<fecha>.json)
//   node scripts/telefono/datos.mjs cargar <archivo> [--personal]    reemplaza los datos del juego y recarga la app
//   node scripts/telefono/datos.mjs resumen [--personal]             cuántas cosas hay
//
// Sin --personal actúa sobre "RPG Pruebas". Los archivos de `guardar` contienen datos personales:
// la carpeta .respaldos/ está fuera de git. La API key no viaja nunca: vive cifrada aparte.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pickApp } from './app.mjs'
import { dump, load, summarize } from './volcado.mjs'

const { app, label, args } = pickApp()
const [command, file] = args

if (command === 'resumen') {
  console.log(`${label}: ${summarize(await dump(app))}`)
} else if (command === 'guardar') {
  const data = await dump(app)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const target = file ?? `.respaldos/${app.endsWith('.pruebas') ? 'pruebas' : 'telefono'}-${stamp}.json`
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(data))
  console.log(`${label} guardada en ${target}: ${summarize(data)}`)
} else if (command === 'cargar' && file) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  const { before, after } = await load(app, data)
  console.log(`${label}`)
  console.log(`Antes: ${before}`)
  console.log(`Ahora: ${after}${data.stores.settings ? '' : ' (se conservó la configuración)'}`)
} else {
  console.log('Uso: node scripts/telefono/datos.mjs guardar [archivo] | cargar <archivo> | resumen   [--personal]')
  process.exit(1)
}
