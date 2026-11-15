// Evalúa un archivo .js dentro de la app y muestra el resultado.
//   node scripts/telefono/evaluar.mjs <archivo.js> [--personal]
import { readFileSync } from 'node:fs'
import { evaluate, pickApp } from './app.mjs'

const { app, args } = pickApp()
if (!args[0]) {
  console.log('Uso: node scripts/telefono/evaluar.mjs <archivo.js> [--personal]')
  process.exit(1)
}
const value = await evaluate(app, readFileSync(args[0], 'utf8'))
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1))
