// Detalle de un hábito: su historial completo, estadísticas de largo plazo y consejos basados en la biblioteca.
// Todo se calcula en el teléfono con los registros: no llama a la IA.
import { addDays, gameDayOf, weekdayOf, type GameDay } from '../../game/gameDay'
import type { GameDatabase, Habit, HabitLog, HabitState } from '../db'
import { habitStreak, weekCount } from './habits'
import { isScheduledOn } from './shared'

export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']

/** Mínimo de días con hora para hablar de la hora promedio. */
export const MIN_TIME_SAMPLES = 5

const credit = (state: HabitState | undefined) => (state === 'done' ? 1 : state === 'half' ? 0.5 : 0)
const mondayOf = (day: GameDay) => addDays(day, -weekdayOf(day))

export interface HabitInsight {
  tone: 'good' | 'warn' | 'info'
  text: string
  /** Principio de la biblioteca en el que se basa el consejo. */
  principle?: string
}

/** Minutos desde la medianoche, contados desde las 4:00 a. m. (inicio del día de juego) para promediar bien. */
const shifted = (minutes: number) => (minutes - 240 + 1440) % 1440
const unshifted = (minutes: number) => (Math.round(minutes) + 240) % 1440

export function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  const suffix = hour < 12 ? 'a. m.' : 'p. m.'
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${suffix}`
}

const minutesOf = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

/** Todo lo que muestra la pantalla de detalle de un hábito. `null` si el hábito no existe. */
export async function getHabitStats(db: GameDatabase, habitId: string, today: GameDay) {
  const habit = await db.habits.get(habitId)
  if (!habit) return null
  const stats = computeStats(habit, await db.habitLogs.where('habitId').equals(habitId).toArray(), today)
  return { ...stats, insights: habitInsights(stats, today) }
}

/** Las cifras del hábito a partir de sus registros. */
export function computeStats(habit: Habit, rows: HabitLog[], today: GameDay) {
  const logs = new Map(rows.map((row) => [row.day, row.state]))
  const weekly = habit.frequency.kind === 'timesPerWeek' ? habit.frequency.times : null
  const end = habit.archivedDay && habit.archivedDay <= today ? addDays(habit.archivedDay, -1) : today

  // Días programados hasta hoy. Hoy solo cuenta si ya se registró (todavía hay tiempo de hacerlo).
  let scheduled = 0
  let done = 0
  let half = 0
  let missed = 0
  let unregistered = 0
  let best = 0
  let run = 0
  const weekdays = Array.from({ length: 7 }, () => ({ scheduled: 0, credit: 0 }))
  for (let day = habit.createdDay; day <= end; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day)) continue
    const state = logs.get(day)
    if (day === today && !state) continue
    scheduled += 1
    if (state === 'done') done += 1
    else if (state === 'half') half += 1
    else if (state === 'missed') missed += 1
    else unregistered += 1
    weekdays[weekdayOf(day)].scheduled += 1
    weekdays[weekdayOf(day)].credit += credit(state)
    run = state === 'done' || state === 'half' ? run + 1 : 0
    best = Math.max(best, run)
  }

  // Cumplimiento: lo hecho entre lo esperado. Con «N veces por semana», lo esperado es N por semana.
  const expected = (first: GameDay) => {
    if (!weekly) return null
    const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(first)) / 86_400_000) + 1)
    return (weekly * days) / 7
  }
  const totalCredit = done + half * 0.5
  const totalExpected = expected(habit.createdDay) ?? scheduled
  const rate = totalExpected > 0 ? Math.min(1, totalCredit / totalExpected) : null

  const since30 = [addDays(today, -29), habit.createdDay].sort().at(-1)!
  let credit30 = 0
  let scheduled30 = 0
  for (let day = since30; day <= end; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day) || (day === today && !logs.get(day))) continue
    scheduled30 += 1
    credit30 += credit(logs.get(day))
  }
  const expected30 = expected(since30) ?? scheduled30
  const rate30 = expected30 > 0 ? Math.min(1, credit30 / expected30) : null

  // Semanas cumplidas, para los hábitos de N veces por semana.
  let weeksMet = 0
  let weeksTotal = 0
  if (weekly) {
    for (let monday = mondayOf(habit.createdDay); monday <= end; monday = addDays(monday, 7)) {
      if (monday === mondayOf(today)) continue
      weeksTotal += 1
      if (weekCount(logs, monday) >= weekly) weeksMet += 1
    }
  }

  // Hora a la que sueles marcarlo: solo registros hechos el mismo día.
  const times = rows
    .filter(
      (row) => row.at && (row.state === 'done' || row.state === 'half') && gameDayOf(new Date(row.at)) === row.day,
    )
    .map((row) => {
      const date = new Date(row.at!)
      return shifted(date.getHours() * 60 + date.getMinutes())
    })
  const averageTime =
    times.length > 0
      ? { minutes: unshifted(times.reduce((sum, value) => sum + value, 0) / times.length), samples: times.length }
      : null

  const weekdayRates = weekdays.map((item, weekday) => ({
    weekday,
    scheduled: item.scheduled,
    rate: item.scheduled > 0 ? item.credit / item.scheduled : null,
  }))

  return {
    habit,
    logs,
    start: habit.createdDay,
    end,
    scheduled,
    done,
    half,
    missed,
    unregistered,
    rate,
    rate30,
    streak: habitStreak(habit, logs, today),
    best: weekly ? null : best,
    weekly,
    weeksMet,
    weeksTotal,
    weekdays: weekly ? null : weekdayRates,
    averageTime,
  }
}

export type HabitNumbers = ReturnType<typeof computeStats>
export type HabitStats = HabitNumbers & { insights: HabitInsight[] }

/** Consejos según los datos, cada uno apoyado en un principio de la biblioteca. */
export function habitInsights(stats: HabitNumbers, today: GameDay): HabitInsight[] {
  const insights: HabitInsight[] = []
  const percent = (value: number) => `${Math.round(value * 100)} %`

  if (stats.scheduled < 7) {
    insights.push({
      tone: 'info',
      text: 'Todavía hay pocos días registrados. Con una o dos semanas más verás aquí tus patrones.',
      principle: 'H12',
    })
  }

  // Ayer no lo hizo: lo importante es no fallar dos veces seguidas.
  const yesterday = addDays(today, -1)
  const yesterdayState = stats.logs.get(yesterday)
  if (
    !stats.weekly &&
    isScheduledOn(stats.habit, yesterday) &&
    yesterdayState !== 'done' &&
    yesterdayState !== 'half' &&
    !stats.logs.get(today)
  ) {
    insights.push({
      tone: 'warn',
      text: 'Ayer no quedó registrado. Fallar un día no arruina el hábito; lo importante es no fallar dos seguidos: hazlo hoy.',
      principle: 'H11',
    })
  }

  // El día de la semana que más cuesta.
  if (stats.weekdays && stats.rate !== null) {
    const candidates = stats.weekdays.filter((item) => item.scheduled >= 3 && item.rate !== null)
    const worst = candidates.sort((a, b) => a.rate! - b.rate!)[0]
    if (worst && stats.rate - worst.rate! >= 0.15) {
      insights.push({
        tone: 'warn',
        text: `Los ${WEEKDAY_NAMES[worst.weekday]} son tu día más difícil (${percent(worst.rate!)}, contra ${percent(stats.rate)} en general). Decide desde antes a qué hora y dónde lo harás ese día.`,
        principle: 'H2',
      })
    }
  }

  // La hora: cuándo lo haces y si el recordatorio te queda bien.
  const reminder = stats.habit.reminder
  if (stats.averageTime && stats.averageTime.samples >= MIN_TIME_SAMPLES) {
    const average = stats.averageTime.minutes
    const suggested = Math.round(((shifted(average) - 15 + 1440) % 1440) / 15) * 15
    const suggestion = formatClock(unshifted(suggested))
    if (reminder && Math.abs(shifted(minutesOf(reminder)) - shifted(average)) > 60) {
      insights.push({
        tone: 'info',
        text: `Sueles hacerlo cerca de las ${formatClock(average)}, pero tu recordatorio suena a las ${formatClock(minutesOf(reminder))}. Prueba moverlo a las ${suggestion}.`,
        principle: 'H1',
      })
    } else if (!reminder) {
      insights.push({
        tone: 'info',
        text: `Sueles hacerlo cerca de las ${formatClock(average)}. Un recordatorio a las ${suggestion} te ayuda a que sea siempre a la misma hora.`,
        principle: 'H1',
      })
    } else {
      insights.push({
        tone: 'good',
        text: `Lo haces a una hora constante, cerca de las ${formatClock(average)}: eso ayuda a que se vuelva automático.`,
        principle: 'H1',
      })
    }
  } else if (!reminder) {
    insights.push({
      tone: 'info',
      text: 'Aún no hay datos de la hora (se guardan desde ahora al marcarlo). Ponerle un momento fijo ayuda a que se vuelva automático.',
      principle: 'H1',
    })
  }

  // Cómo va el último mes.
  if (stats.rate30 !== null && stats.scheduled >= 7) {
    if (stats.rate30 >= 0.85) {
      insights.push({
        tone: 'good',
        text: `Vas muy bien: ${percent(stats.rate30)} en los últimos 30 días. Cada día que lo haces cuenta como un avance.`,
        principle: 'M3',
      })
    } else if (stats.rate30 < 0.5) {
      insights.push({
        tone: 'warn',
        text: `En los últimos 30 días va en ${percent(stats.rate30)}. Antes de exigirte más, prueba hacerlo más pequeño o cambiarle el momento.`,
        principle: 'H5',
      })
    }
  }
  return insights
}

const STATE_MARKS = { done: '✓ hecho', half: '½ a medias', missed: '✗ no lo hizo' } as const
const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function frequencyText(habit: Habit): string {
  const { frequency } = habit
  if (frequency.kind === 'timesPerWeek') return `${frequency.times} veces por semana`
  if (frequency.kind === 'weekdays') return `solo ciertos días: ${frequency.days.map((day) => LETTERS[day]).join(', ')}`
  return 'diario'
}

/**
 * Todo el contexto del hábito en texto, para el análisis con IA: datos del juego y horas de sueño, nada más.
 * Los últimos `days` días van uno por uno.
 */
export async function habitAnalysisInput(
  db: GameDatabase,
  habitId: string,
  today: GameDay,
  days = 90,
): Promise<string> {
  const stats = await getHabitStats(db, habitId, today)
  if (!stats) return ''
  const { habit } = stats
  const route = habit.routeItemId ? await db.routeItems.get(habit.routeItemId) : undefined
  const sleep = new Map((await db.sleep.toArray()).map((item) => [item.id, item.hours]))
  const rows = new Map((await db.habitLogs.where('habitId').equals(habitId).toArray()).map((row) => [row.day, row]))
  const percent = (value: number | null) => (value === null ? 'sin datos' : `${Math.round(value * 100)} %`)

  const lines = [
    `Hábito: «${habit.title}». Frecuencia: ${frequencyText(habit)}. Dificultad ${habit.difficulty} de 5.`,
    `Recordatorio: ${habit.reminder ? formatClock(minutesOf(habit.reminder)) : 'sin recordatorio'}.`,
    habit.steps?.length ? `Objetivos: ${habit.steps.join('; ')}.` : null,
    route
      ? `Es parte de una ruta progresiva. Niveles: ${route.levels.join(' → ')}. Va en el nivel ${(habit.level ?? 0) + 1}.`
      : null,
    `Empezó el ${stats.start}; hoy es ${today}.`,
    `Totales: ${stats.done} hechos, ${stats.half} a medias, ${stats.missed} no hechos, ${stats.unregistered} sin registrar (de ${stats.scheduled} días que le tocaban).`,
    `Cumplimiento total: ${percent(stats.rate)}. Últimos 30 días: ${percent(stats.rate30)}.`,
    stats.weekly
      ? `Racha actual: ${stats.streak} semanas. Semanas cumplidas: ${stats.weeksMet} de ${stats.weeksTotal}.`
      : `Racha actual: ${stats.streak} días. Mejor racha: ${stats.best} días.`,
    stats.weekdays
      ? `Por día de la semana: ${stats.weekdays
          .map((item) => `${WEEKDAY_NAMES[item.weekday]} ${percent(item.rate)} (${item.scheduled} días)`)
          .join(', ')}.`
      : null,
    stats.averageTime
      ? `Hora promedio en que lo marca: ${formatClock(stats.averageTime.minutes)} (${stats.averageTime.samples} días con hora).`
      : 'Todavía no hay datos de la hora en que lo hace.',
    '',
    `Día por día (últimos ${days} días; sueño = horas dormidas la noche anterior):`,
  ]
  const first = [addDays(today, -(days - 1)), stats.start].sort().at(-1)!
  for (let day = first; day <= today; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day)) continue
    const row = rows.get(day)
    const sameDay = row?.at && gameDayOf(new Date(row.at)) === day
    const time = sameDay
      ? ` a las ${formatClock(new Date(row!.at!).getHours() * 60 + new Date(row!.at!).getMinutes())}`
      : ''
    const state = row ? STATE_MARKS[row.state] : day === today ? 'pendiente (hoy)' : '? sin registrar'
    const hours = sleep.get(day)
    lines.push(`${day} ${LETTERS[weekdayOf(day)]}: ${state}${time}${hours !== undefined ? `; sueño ${hours} h` : ''}`)
  }
  // Un renglón por dato.
  return lines.filter((line) => line !== null).join(String.fromCharCode(10))
}
