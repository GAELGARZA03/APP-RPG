// Importación de una sola vez: las horas de toma de «Mi Pastilla» al hábito «Minoxidil» de la app personal.
// Solo agrega la hora a días que ya están marcados como hechos; no cambia ningún estado ni da XP.
// Cada toma es la fecha y hora reales; antes de las 4:00 a. m. cuenta para el día anterior (igual que en la app).
//
//   node scripts/telefono/importar-horas.mjs
//
// Antes: npm run phone:save.
import { APPS, evaluate } from './app.mjs'

const HABIT_TITLE = 'Minoxidil'
// [año, mes (1-12), día, hora, minuto] tal como aparecen en el historial de Mi Pastilla.
const TAKEN = [
  [2026, 11, 16, 20, 45],
  [2026, 11, 15, 1, 10],
  [2026, 11, 13, 1, 56],
  [2026, 11, 11, 22, 30],
  [2026, 11, 10, 12, 34],
  [2026, 11, 9, 20, 59],
  [2026, 11, 9, 0, 38],
  [2026, 11, 7, 20, 52],
  [2026, 11, 6, 21, 31],
  [2026, 11, 5, 22, 25],
  [2026, 11, 4, 21, 2],
]

const result = await evaluate(
  APPS.personal,
  `(async () => {
    const idb = await new Promise((resolve, reject) => { const r = indexedDB.open('real-life-rpg'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const taken = ${JSON.stringify(TAKEN)}
    // Día de juego: antes de las 4:00 a. m. locales sigue siendo el día anterior.
    const gameDay = (date) => {
      const shifted = new Date(date.getTime() - 4 * 3600 * 1000)
      return shifted.getFullYear() + '-' + String(shifted.getMonth() + 1).padStart(2, '0') + '-' + String(shifted.getDate()).padStart(2, '0')
    }
    const out = await new Promise((resolve, reject) => {
      const tx = idb.transaction(['habits', 'habitLogs'], 'readwrite')
      const logs = tx.objectStore('habitLogs')
      const summary = { updated: [], skipped: [] }
      tx.objectStore('habits').getAll().onsuccess = (event) => {
        const habit = event.target.result.find((item) => item.title === ${JSON.stringify(HABIT_TITLE)} && item.archivedDay === null)
        if (!habit) { summary.error = 'No encontré el hábito'; return }
        for (const [year, month, date, hour, minute] of taken) {
          const at = new Date(year, month - 1, date, hour, minute)
          const day = gameDay(at)
          logs.get(habit.id + ':' + day).onsuccess = (got) => {
            const log = got.target.result
            if (!log || (log.state !== 'done' && log.state !== 'half')) { summary.skipped.push(day); return }
            log.at = at.getTime()
            logs.put(log)
            summary.updated.push(day + ' ' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'))
          }
        }
      }
      tx.oncomplete = () => resolve(summary)
      tx.onerror = () => reject(tx.error)
    })
    idb.close()
    setTimeout(() => location.reload(), 100)
    return JSON.stringify(out)
  })()`,
)
console.log(result)
