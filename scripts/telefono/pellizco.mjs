// Hace un gesto de dos dedos (pellizco) dentro de la app, que `adb shell input` no puede hacer.
// Usa DevTools de la WebView, así que solo funciona con la versión de desarrollo.
//
//   node scripts/telefono/pellizco.mjs <x> <y> <separaciónInicial> <separaciónFinal> [pasos] [--personal]
//
// Las coordenadas van en píxeles CSS (el teléfono mide unos 360 de ancho). Al terminar muestra
// la transformación del lienzo del árbol antes y después, para comprobar que acercó o alejó.
import { connect, pickApp } from './app.mjs'

const { app, args } = pickApp()
const [x, y, from, to, steps = 24] = args.map(Number)
if (![x, y, from, to].every(Number.isFinite)) {
  console.log('Uso: node scripts/telefono/pellizco.mjs <x> <y> <separaciónInicial> <separaciónFinal> [pasos]')
  process.exit(1)
}

const socket = await connect(app)

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
  await send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: points(from + ((to - from) * step) / steps),
  })
  await new Promise((resolve) => setTimeout(resolve, 16))
}
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
console.log(`antes:   ${before}`)
console.log(`después: ${await transform()}`)
console.log(`gesto de ${Date.now() - started} ms en ${steps} pasos`)
socket.close()
