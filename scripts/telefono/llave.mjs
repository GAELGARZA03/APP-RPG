// Copia tu API key de Gemini de la app personal a "RPG Pruebas", para no pegarla a mano.
//   npm run phone:llave
//
// La llave pasa de una app a otra por USB, solo en memoria: no se imprime ni se guarda en ningún archivo.
import { APPS, evaluate } from './app.mjs'

const NAME = 'gemini_api_key'
const plugin = `window.Capacitor?.Plugins?.SecretStore`

const key = await evaluate(APPS.personal, `${plugin}.get({ name: '${NAME}' }).then((result) => result.value)`)
if (!key) {
  console.log('Tu app personal no tiene llave guardada. Pégala en RPG Pruebas: Ajustes › Inteligencia artificial.')
  process.exit(1)
}
const saved = await evaluate(
  APPS.pruebas,
  `${plugin}.set({ name: '${NAME}', value: ${JSON.stringify(key)} }).then(() => ${plugin}.get({ name: '${NAME}' })).then((result) => result.value === ${JSON.stringify(key)})`,
)
console.log(saved ? '✔ Llave copiada a RPG Pruebas.' : 'No se pudo copiar la llave. Pégala a mano en RPG Pruebas.')
