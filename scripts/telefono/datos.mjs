// Guarda y carga los datos de la app en el teléfono por USB, sin tocar la pantalla.
// Solo funciona con la versión de desarrollo (APK debug), que permite depurar la WebView.
//
//   node scripts/telefono/datos.mjs guardar [archivo]   copia TODO lo del teléfono a un archivo (por defecto .respaldos/<fecha>.json)
//   node scripts/telefono/datos.mjs cargar <archivo>    reemplaza los datos del juego por los del archivo y recarga la app
//   node scripts/telefono/datos.mjs resumen             muestra cuántas cosas hay en el teléfono
//
// Los archivos de `guardar` contienen datos personales: la carpeta .respaldos/ está fuera de git.
// La API key no viaja nunca: vive cifrada aparte y este script no la lee.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const APP = 'com.gaelgarza.realliferpg'
const DATABASE = 'real-life-rpg'
const GAME_STORES = ['bounties', 'campaigns', 'sideQuests', 'xpEvents', 'player', 'skills', 'evidence', 'dailies']
const adb = `${process.env.ANDROID_HOME ?? `${process.env.LOCALAPPDATA}/Android/Sdk`}/platform-tools/adb${process.platform === 'win32' ? '.exe' : ''}`
const run = (...args) => execFileSync(adb, args, { maxBuffer: 1e9 }).toString()
/** `pidof` termina con error si la app está cerrada: aquí eso es solo "sin proceso". */
const pidOf = () => {
  try {
    return run('shell', 'pidof', APP).trim()
  } catch {
    return ''
  }
}

/** Evalúa una expresión dentro de la app y devuelve su resultado. */
async function evaluate(expression) {
  let pid = pidOf()
  if (!pid) {
    run('shell', 'monkey', '-p', APP, '-c', 'android.intent.category.LAUNCHER', '1')
    await new Promise((resolve) => setTimeout(resolve, 4000))
    pid = pidOf()
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
  try {
    return await new Promise((resolve, reject) => {
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data)
        if (data.id !== 1) return
        if (data.result.exceptionDetails) reject(new Error(data.result.exceptionDetails.exception?.description ?? 'Error en la app'))
        else resolve(data.result.result.value)
      }
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  } finally {
    socket.close()
  }
}

const OPEN = `const idb = await new Promise((resolve, reject) => { const request = indexedDB.open(${JSON.stringify(DATABASE)}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })`

async function dump() {
  const text = await evaluate(`(async () => {
    ${OPEN}
    const stores = {}
    for (const name of idb.objectStoreNames) {
      stores[name] = await new Promise((resolve) => { const request = idb.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result) })
    }
    idb.close()
    return JSON.stringify({ app: 'real-life-rpg', kind: 'volcado', createdAt: new Date().toISOString(), stores })
  })()`)
  return JSON.parse(text)
}

function summarize(data) {
  const count = (name) => data.stores[name]?.length ?? 0
  const xp = (data.stores.xpEvents ?? []).reduce((sum, event) => sum + event.xp, 0)
  return `${count('campaigns')} campañas, ${count('sideQuests')} misiones, ${count('bounties')} contratos, ${count('skills')} habilidades, ${count('evidence')} evidencias, ${xp} XP`
}

const [command, file] = process.argv.slice(2)

if (command === 'resumen') {
  console.log(summarize(await dump()))
} else if (command === 'guardar') {
  const data = await dump()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const target = file ?? `.respaldos/telefono-${stamp}.json`
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, JSON.stringify(data))
  console.log(`Guardado en ${target}: ${summarize(data)}`)
} else if (command === 'cargar' && file) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data.app !== 'real-life-rpg' || data.kind !== 'volcado' || typeof data.stores !== 'object') {
    throw new Error('Ese archivo no es un volcado hecho con este script.')
  }
  // Las tablas del juego siempre se reemplazan (vacías si el archivo no las trae).
  // La configuración solo se reemplaza si el archivo la incluye; un archivo de demostración no la trae.
  const names = [...GAME_STORES, ...(data.stores.settings ? ['settings'] : [])]
  const before = summarize(await dump())
  await evaluate(`(async () => {
    ${OPEN}
    const data = ${JSON.stringify(Object.fromEntries(names.map((name) => [name, data.stores[name] ?? []])))}
    const names = Object.keys(data).filter((name) => idb.objectStoreNames.contains(name))
    await new Promise((resolve, reject) => {
      const transaction = idb.transaction(names, 'readwrite')
      for (const name of names) {
        const store = transaction.objectStore(name)
        store.clear()
        for (const row of data[name]) store.put(row)
      }
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    idb.close()
    // La app no se entera de lo escrito por fuera: se recarga para que lo lea.
    setTimeout(() => location.reload(), 100)
    return 'ok'
  })()`)
  console.log(`Antes: ${before}`)
  console.log(`Ahora: ${summarize(data)}${data.stores.settings ? '' : ' (se conservó la configuración del teléfono)'}`)
} else {
  console.log('Uso: node scripts/telefono/datos.mjs guardar [archivo] | cargar <archivo> | resumen')
  process.exit(1)
}
