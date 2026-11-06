/** Día de juego con formato YYYY-MM-DD. Estas cadenas se pueden comparar directamente. */
export type GameDay = string

const DAY_CLOSE_HOUR = 4

function toGameDay(utcMilliseconds: number): GameDay {
  return new Date(utcMilliseconds).toISOString().slice(0, 10)
}

/** Antes de las 4:00 a. m. locales, sigue contando como el día anterior. */
export function gameDayOf(date: Date): GameDay {
  const dayOffset = date.getHours() < DAY_CLOSE_HOUR ? -1 : 0
  return toGameDay(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset))
}

export function addDays(day: GameDay, amount: number): GameDay {
  const [year, month, date] = day.split('-').map(Number)
  return toGameDay(Date.UTC(year, month - 1, date + amount))
}
