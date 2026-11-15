// Hace un gesto de dos dedos (pellizco) dentro de la app, que `adb shell input` no puede hacer.
// Usa DevTools de la WebView, así que solo funciona con la versión de desarrollo.
//
//   node scripts/telefono/pellizco.mjs <x> <y> <separaciónInicial> <separaciónFinal> [pasos]
//
// Las coordenadas van en píxeles CSS (el teléfono mide unos 360 de ancho). Al terminar muestra
// la transformación del lienzo del árbol antes y después, para comprobar que acercó o alejó.
import { execFileSync } from 'node:child_process'

const APP = 'com.gaelgarza.realliferpg'
const adb = `${process.env.ANDROID_HOME ?? `${process.env.LOCALAPPDATA}/Android/Sdk`}/platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`
const [x, y, from, to, steps = '24'] = process.argv.slice(2).map(Number)
if (![x, y, from, to].every(Number.isFinite)) {
  console.log('Uso: node scripts/telefono/pellizco.mjs <x> <y> <separaciónInicial> <separaciónFinal> [pasos]')
  process.exit(1)
}

const pid = execFileSync(adb, ['shell', 'pidof', APP]).toString().trim()
execFileSync(adb, ['forward', 'tcp:9229', `localabstract:webview_devtools_remote_${pid}`])
const pages = await (await fetch('http://127.0.0.1:9229/json')).json()
const socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => (socket.onopen = resolve))

let nextId = 0
const send = (method, params) =>
  new Promise((resolve) => {
    const id = ++nextId
    const listener = (message) => {
      const data = JSON.parse(message.data)
      if (data.id !== id) return
      socket.removeEventListener('message', listener)
      resolve(data.result)
    }
    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ id, method, params }))
  })

const transform = async () =>
  (
    await send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="skill-tree"] > div')?.style.transform ?? 'sin árbol'`,
      returnByValue: true,
    })
  ).result.value
const points = (gap) => [
  { x: x - gap / 2, y, id: 0 },
  { x: x + gap / 2, y, id: 1 },
]

const before = await transform()
const started = Date.now()
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) })
for (let step = 1; step <= steps; step += 1) {
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + ((to - from) * step) / steps) })
  await new Promise((resolve) => setTimeout(resolve, 16))
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
console.log(`antes:   ${before}`)
console.log(`después: ${await transform()}`)
console.log(`gesto de ${Date.now() - started} ms en ${steps} pasos`)
socket.close()
