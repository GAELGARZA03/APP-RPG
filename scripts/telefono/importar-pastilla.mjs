// Importación de una sola vez: el historial de «Mi Pastilla» al hábito «Minoxidil» de la app personal.
// Del 19 de octubre al 15 de noviembre de 2026 (el 16 se marca en la app y da XP normal).
// No tomada: viernes 13 y domingo 15 de noviembre. Los días viejos son solo registro y no dan XP, como en la app.
//
//   node scripts/telefono/importar-pastilla.mjs
//
// Antes: npm run phone:save. No borra nada: solo agrega los días que no estén registrados.
import { APPS, evaluate } from './app.mjs'

const HABIT_TITLE = 'Minoxidil'
const START = '2026-10-19'
const END = '2026-11-15'
const MISSED = ['2026-11-13', '2026-11-15']

const days = []
for (let date = new Date(`${START}T12:00:00Z`); date.toISOString().slice(0, 10) <= END; date.setUTCDate(date.getUTCDate() + 1)) {
  days.push(date.toISOString().slice(0, 10))
}

const result = await evaluate(
  APPS.personal,
  `(async () => {
    const idb = await new Promise((resolve, reject) => { const r = indexedDB.open('real-life-rpg'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const days = ${JSON.stringify(days)}
    const missed = ${JSON.stringify(MISSED)}
    const out = await new Promise((resolve, reject) => {
      const tx = idb.transaction(['habits', 'habitLogs'], 'readwrite')
      const habits = tx.objectStore('habits')
      const logs = tx.objectStore('habitLogs')
      const summary = { added: 0, kept: 0 }
      habits.getAll().onsuccess = (event) => {
        const all = event.target.result
        let habit = all.find((item) => item.title === ${JSON.stringify(HABIT_TITLE)} && item.archivedDay === null)
        if (!habit) {
          // Si no existe, se crea como lo tenía: diario, fácil y con recordatorio a las 9:00 p. m.
          habit = {
            id: crypto.randomUUID(),
            title: ${JSON.stringify(HABIT_TITLE)},
            difficulty: 1,
            frequency: { kind: 'daily' },
            order: all.reduce((max, item) => Math.max(max, item.order), -1) + 1,
            createdAt: new Date(days[0] + 'T12:00:00').getTime(),
            createdDay: days[0],
            archivedDay: null,
            reminder: '21:00',
          }
          habits.put(habit)
          summary.created = true
        }
        summary.habit = habit.title
        if (habit.createdDay > days[0]) {
          habit.createdDay = days[0]
          habit.createdAt = new Date(days[0] + 'T12:00:00').getTime()
          habits.put(habit)
        }
        for (const day of days) {
          const id = habit.id + ':' + day
          logs.get(id).onsuccess = (got) => {
            if (got.target.result) { summary.kept += 1; return }
            logs.put({ id, habitId: habit.id, day, state: missed.includes(day) ? 'missed' : 'done' })
            summary.added += 1
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
