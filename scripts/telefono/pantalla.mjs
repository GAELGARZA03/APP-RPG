// Ayudante para manejar el teléfono: node ph.mjs <comando> [args]
//   texts            -> lista los textos visibles
//   tap "<texto>"    -> toca el primer elemento cuyo texto o descripción contiene <texto> (n-ésimo con :n)
//   shot <nombre>    -> captura a <nombre>.png
//   back | key <n>   -> botón atrás / keyevent
//   type "<texto>"   -> escribe (sin acentos)
//   swipe x1 y1 x2 y2 [ms]
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const adb = process.env.LOCALAPPDATA + '/Android/Sdk/platform-tools/adb.exe'
const run = (...args) => execFileSync(adb, args, { maxBuffer: 1e8 })
const [command, ...args] = process.argv.slice(2)

function nodes() {
  const xml = run('exec-out', 'uiautomator', 'dump', '/dev/tty').toString()
  const list = []
  for (const match of xml.matchAll(/<node [^>]*>/g)) {
    const attr = (name) => (match[0].match(new RegExp(` ${name}="([^"]*)"`)) ?? [])[1] ?? ''
    const text = (attr('text') || attr('content-desc')).replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    const bounds = attr('bounds').match(/\d+/g)?.map(Number)
    if (text && bounds) list.push({ text, cls: attr('class').split('.').pop(), x: (bounds[0] + bounds[2]) >> 1, y: (bounds[1] + bounds[3]) >> 1, h: bounds[3] - bounds[1] })
  }
  return list
}

if (command === 'texts') {
  for (const node of nodes()) console.log(`${String(node.x).padStart(4)},${String(node.y).padStart(4)} ${node.cls.padEnd(9).slice(0, 9)} ${node.text.slice(0, 110)}`)
} else if (command === 'tap') {
  const [needle, index = '0'] = args[0].split('::')
  // Reintenta unos segundos: tras una recarga o una animación el elemento tarda en aparecer.
  let target
  for (let attempt = 0; attempt < 12 && !target; attempt += 1) {
    if (attempt > 0) execFileSync(adb, ['shell', 'sleep', '0.6'])
    target = nodes().filter((node) => node.text.toLowerCase().includes(needle.toLowerCase()) && node.y > 0 && node.y < 2340)[Number(index)]
  }
  if (!target) {
    console.error('NO ENCONTRADO:', needle)
    process.exit(1)
  }
  run('shell', 'input', 'tap', String(target.x), String(target.y))
  console.log('tap', target.x, target.y, target.text.slice(0, 60))
} else if (command === 'shot') {
  writeFileSync(join(dir, `${args[0]}.png`), run('exec-out', 'screencap', '-p'))
  console.log(join(dir, `${args[0]}.png`))
} else if (command === 'back') {
  run('shell', 'input', 'keyevent', '4')
} else if (command === 'key') {
  run('shell', 'input', 'keyevent', args[0])
} else if (command === 'type') {
  run('shell', 'input', 'text', args[0].replace(/ /g, '%s'))
} else if (command === 'swipe') {
  run('shell', 'input', 'swipe', ...args)
} else if (command === 'xy') {
  run('shell', 'input', 'tap', args[0], args[1])
}
