// Piezas comunes de los scripts del teléfono: adb, qué app usar y evaluar código dentro de ella.
//
// Hay dos apps instaladas, cada una con sus propios datos:
//   pruebas   "RPG Pruebas" (icono naranja). Es la de siempre en estos scripts: aquí se cargan escenarios.
//   personal  "Real Life RPG", la del usuario. Solo se toca con --personal.
import { execFileSync } from 'node:child_process'

export const APPS = {
  personal: 'com.gaelgarza.realliferpg',
  pruebas: 'com.gaelgarza.realliferpg.pruebas',
}

export const adb = `${process.env.ANDROID_HOME ?? `${process.env.LOCALAPPDATA}/Android/Sdk`}/platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`
export const run = (...args) => execFileSync(adb, args, { maxBuffer: 1e9, stdio: 'pipe' }).toString()

/** Separa `--personal` del resto de argumentos y devuelve el paquete elegido. */
export function pickApp(args = process.argv.slice(2)) {
  const personal = args.includes('--personal')
  return {
    app: personal ? APPS.personal : APPS.pruebas,
    label: personal ? 'Real Life RPG (personal)' : 'RPG Pruebas',
    args: args.filter((arg) => arg !== '--personal'),
  }
}

export function isInstalled(app) {
  return run('shell', 'pm', 'list', 'packages', app)
    .split('\n')
    .some((line) => line.trim() === `package:${app}`)
}

/** `pidof` termina con error si la app está cerrada: aquí eso es solo "sin proceso". */
function pidOf(app) {
  try {
    return run('shell', 'pidof', app).trim()
  } catch {
    return ''
  }
}

/** Abre la app si hace falta y devuelve el WebSocket de DevTools de su WebView. */
export async function connect(app) {
  if (!isInstalled(app)) {
    throw new Error(
      app === APPS.pruebas
        ? 'La app de pruebas no está instalada. Instálala con: npm run phone:pruebas'
        : 'La app personal no está instalada.',
    )
  }
  let pid = pidOf(app)
  if (!pid) {
    run('shell', 'monkey', '-p', app, '-c', 'android.intent.category.LAUNCHER', '1')
    await new Promise((resolve) => setTimeout(resolve, 4000))
    pid = pidOf(app)
  }
  if (!pid) throw new Error('La app no está abierta y no se pudo abrir. ¿El teléfono está desbloqueado?')
  run('forward', 'tcp:9229', `localabstract:webview_devtools_remote_${pid}`)
  const pages = await (await fetch('http://127.0.0.1:9229/json')).json()
  const page = pages.find((item) => item.type === 'page')
  if (!page) throw new Error('No se encontró la WebView. Abre la app en el teléfono e intenta de nuevo.')

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error('No se pudo conectar con la WebView.'))
  })
  return socket
}

/** Evalúa una expresión dentro de la app y devuelve su resultado. */
export async function evaluate(app, expression) {
  const socket = await connect(app)
  try {
    return await new Promise((resolve, reject) => {
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data)
        if (data.id !== 1) return
        if (data.result.exceptionDetails)
          reject(new Error(data.result.exceptionDetails.exception?.description ?? 'Error en la app'))
        else resolve(data.result.result.value)
      }
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      )
    })
  } finally {
    socket.close()
  }
}
