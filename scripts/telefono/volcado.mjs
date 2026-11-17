// Leer y reemplazar los datos del juego dentro de una app, por DevTools de su WebView.
import { evaluate } from './app.mjs'

const DATABASE = 'real-life-rpg'
// `bounties` es la tabla de contratos de las versiones anteriores a los hábitos: así un respaldo viejo
// se puede cargar en una app que aún no se actualiza (y la app lo migra al actualizarse).
const GAME_STORES = [
  'bounties',
  'habits',
  'habitLogs',
  'campaigns',
  'sideQuests',
  'xpEvents',
  'player',
  'skills',
  'evidence',
  'dailies',
  'reviews',
  'dailyNotes',
  'sleep',
  'rewards',
  'redemptions',
  'routeItems',
]

const OPEN = `const idb = await new Promise((resolve, reject) => { const request = indexedDB.open(${JSON.stringify(DATABASE)}); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })`

export async function dump(app) {
  const text = await evaluate(
    app,
    `(async () => {
    ${OPEN}
    const stores = {}
    for (const name of idb.objectStoreNames) {
      stores[name] = await new Promise((resolve) => { const request = idb.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result) })
    }
    idb.close()
    return JSON.stringify({ app: 'real-life-rpg', kind: 'volcado', createdAt: new Date().toISOString(), stores })
  })()`,
  )
  return JSON.parse(text)
}

export function summarize(data) {
  const count = (name) => data.stores[name]?.length ?? 0
  const xp = (data.stores.xpEvents ?? []).reduce((sum, event) => sum + event.xp, 0)
  return `${count('campaigns')} campañas, ${count('sideQuests')} misiones, ${count('habits') || count('bounties')} hábitos, ${count('skills')} habilidades, ${count('evidence')} evidencias, ${xp} XP`
}

/**
 * Reemplaza las tablas del juego (vacías si el archivo no las trae) y recarga la app.
 * La configuración solo se reemplaza si el archivo la incluye; los escenarios no la traen.
 * `settingsPatch` agrega o cambia filas sueltas de configuración (por ejemplo, el tema).
 */
export async function load(app, data, settingsPatch = []) {
  if (data.app !== 'real-life-rpg' || data.kind !== 'volcado' || typeof data.stores !== 'object') {
    throw new Error('Ese archivo no es un volcado hecho con este script.')
  }
  const names = [...GAME_STORES, ...(data.stores.settings ? ['settings'] : [])]
  const before = summarize(await dump(app))
  await evaluate(
    app,
    `(async () => {
    ${OPEN}
    const data = ${JSON.stringify(Object.fromEntries(names.map((name) => [name, data.stores[name] ?? []])))}
    const patch = ${JSON.stringify(settingsPatch)}
    const names = [...new Set([...Object.keys(data), ...(patch.length ? ['settings'] : [])])].filter((name) => idb.objectStoreNames.contains(name))
    await new Promise((resolve, reject) => {
      const transaction = idb.transaction(names, 'readwrite')
      for (const name of Object.keys(data).filter((name) => names.includes(name))) {
        const store = transaction.objectStore(name)
        store.clear()
        for (const row of data[name]) store.put(row)
      }
      if (patch.length) for (const row of patch) transaction.objectStore('settings').put(row)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    idb.close()
    // La app no se entera de lo escrito por fuera: se recarga para que lo lea.
    setTimeout(() => location.reload(), 100)
    return 'ok'
  })()`,
  )
  return { before, after: summarize(data) }
}
