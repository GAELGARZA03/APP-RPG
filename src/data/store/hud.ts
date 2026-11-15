// HUD y semana: nivel, XP y racha que se muestran arriba en Hoy.
import { type GameDay, addDays } from '../../game/gameDay'
import { levelProgress, streakBonusPercent } from '../../game/rules'
import type { GameDatabase } from '../db'
import { gameTables, outcomeOf, projectPlayer } from './shared'

export async function getHud(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const events = await db.xpEvents.toArray()
    const completedToday = new Set(events.filter((event) => event.day === today).map((event) => event.taskId))
    // Hoy ya cuenta para la racha en cuanto se gana XP con cualquier cosa.
    const todayFulfilled = outcomeOf(completedToday) === 'fulfilled'
    const totalXp = events.reduce((sum, event) => sum + event.xp, 0)

    return {
      ...levelProgress(totalXp),
      totalXp,
      completedTasks: events.length,
      streak: player.streak + (todayFulfilled ? 1 : 0),
      streakBonusPercent: streakBonusPercent(player.streak),
      todayFulfilled,
    }
  })
}

export type Hud = Awaited<ReturnType<typeof getHud>>

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WEEK_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** done/missed = día cerrado con o sin avance; today-done = hoy ya hay avance. `rest` ya no se usa. */
export type WeekDayStatus = 'done' | 'missed' | 'rest' | 'today' | 'today-done' | 'future'

/** Semana actual (lunes a domingo) con el resultado de cada día. */
export async function getWeek(db: GameDatabase, today: GameDay) {
  return db.transaction('r', db.xpEvents, async () => {
    const [year, month, date] = today.split('-').map(Number)
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay()
    const monday = addDays(today, -((weekday + 6) % 7))
    const events = await db.xpEvents.where('day').between(monday, addDays(monday, 7)).toArray()

    const completedByDay = new Map<GameDay, Set<string>>()
    for (const event of events) {
      const completed = completedByDay.get(event.day) ?? new Set<string>()
      completed.add(event.taskId)
      completedByDay.set(event.day, completed)
    }

    return WEEK_LABELS.map((label, index) => {
      const day = addDays(monday, index)
      const outcome = outcomeOf(completedByDay.get(day))
      let status: WeekDayStatus
      if (day > today) status = 'future'
      else if (day === today) status = outcome === 'fulfilled' ? 'today-done' : 'today'
      else status = outcome === 'fulfilled' ? 'done' : outcome === 'failed' ? 'missed' : 'rest'
      return { day, label, name: WEEK_NAMES[index], status }
    })
  })
}

export type WeekDay = Awaited<ReturnType<typeof getWeek>>[number]
