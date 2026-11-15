// Sueño: horas dormidas cada noche. Es solo registro: no da XP ni cuenta para la racha.
import { addDays, gameDayOf, type GameDay } from '../../game/gameDay'
import type { GameDatabase } from '../db'

export const MAX_SLEEP_HOURS = 14
/** Meta de referencia para la gráfica. */
export const SLEEP_GOAL_HOURS = 8

/** Redondea a la media hora y lo deja entre 0 y 14 horas. */
export function clampSleep(hours: number): number {
  return Math.min(MAX_SLEEP_HOURS, Math.max(0, Math.round(hours * 2) / 2))
}

/**
 * Guarda las horas dormidas la noche anterior a `day` (`null` las borra). No se registra el futuro.
 * Devuelve `false` si no se pudo.
 */
export async function setSleep(
  db: GameDatabase,
  day: GameDay,
  hours: number | null,
  now = new Date(),
): Promise<boolean> {
  if (day > gameDayOf(now)) return false
  if (hours === null) await db.sleep.delete(day)
  else await db.sleep.put({ id: day, hours: clampSleep(hours) })
  return true
}

/** Horas por día entre `first` y `last` (inclusive), con el promedio de los días registrados. */
export async function getSleepRange(db: GameDatabase, first: GameDay, last: GameDay) {
  const logs = await db.sleep.where('id').between(first, last, true, true).toArray()
  const byDay = new Map(logs.map((log) => [log.id, log.hours]))
  const days: GameDay[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)
  const average =
    logs.length > 0 ? Math.round((logs.reduce((sum, log) => sum + log.hours, 0) / logs.length) * 10) / 10 : null
  return { days: days.map((day) => ({ day, hours: byDay.get(day) ?? null })), average, goal: SLEEP_GOAL_HOURS }
}

export type SleepRange = Awaited<ReturnType<typeof getSleepRange>>

export async function getSleep(db: GameDatabase, day: GameDay): Promise<number | null> {
  return (await db.sleep.get(day))?.hours ?? null
}
