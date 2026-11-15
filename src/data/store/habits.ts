// Hábitos: crear, ordenar, archivar y registrar cada día (hecho, a medias o no hecho), y la libreta mensual.
import { addDays, gameDayOf, weekdayOf, type GameDay } from '../../game/gameDay'
import { HABIT_XP_WINDOW_DAYS, habitXp } from '../../game/rules'
import type { GameDatabase, Habit, HabitFrequency, HabitLog, HabitState } from '../db'
import {
  allSteps,
  gameTables,
  isActiveOn,
  isScheduledOn,
  projectPlayer,
  resettleYesterday,
  settleClosedDays,
  type TaskChanges,
  type TaskInput,
} from './shared'

export type HabitInput = TaskInput & { emoji?: string; frequency?: HabitFrequency; campaignId?: string }

const logId = (habitId: string, day: GameDay) => `${habitId}:${day}`
const byOrder = (a: Habit, b: Habit) => a.order - b.order || a.createdAt - b.createdAt

/** Cómo se puede tocar un día: con XP y racha (hoy y ayer), solo como registro, o nada (futuro). */
export type DayAccess = 'xp' | 'log' | 'none'

export function dayAccess(day: GameDay, today: GameDay): DayAccess {
  if (day > today) return 'none'
  return day >= addDays(today, -HABIT_XP_WINDOW_DAYS) ? 'xp' : 'log'
}

/** Días programados consecutivos con el hábito hecho o a medias. Hoy sin registrar no la rompe. */
export function habitStreak(habit: Habit, logs: Map<GameDay, HabitState>, today: GameDay): number {
  let streak = 0
  for (let day = today; day >= habit.createdDay; day = addDays(day, -1)) {
    if (!isScheduledOn(habit, day)) continue
    const state = logs.get(day)
    if (state === 'done' || state === 'half') streak += 1
    else if (day !== today || state === 'missed') break
  }
  return streak
}

/** Hábitos activos, en el orden de la libreta. */
export async function getHabits(db: GameDatabase, today: GameDay) {
  return (await db.habits.toArray())
    .filter((habit) => isActiveOn(habit, today) || habit.createdDay > today)
    .sort(byOrder)
}

/** Hábitos que tocan hoy, con su registro, su racha y el XP que darían ahora mismo. */
export async function getTodayHabits(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const habits = (await db.habits.toArray()).filter((habit) => isScheduledOn(habit, today)).sort(byOrder)
    const logs = await db.habitLogs
      .where('habitId')
      .anyOf(habits.map((habit) => habit.id))
      .toArray()

    return habits.map((habit) => {
      const byDay = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.day, log.state]))
      const state = byDay.get(today) ?? null
      return {
        ...habit,
        state,
        doneToday: state === 'done' || state === 'half',
        streak: habitStreak(habit, byDay, today),
        xp: habitXp(habit.difficulty, player.streak),
        // Los objetivos marcados otro día de juego ya no cuentan.
        stepsDoneToday: habit.stepsDone?.day === today ? habit.stepsDone.done.length : 0,
      }
    })
  })
}

export type TodayHabit = Awaited<ReturnType<typeof getTodayHabits>>[number]

export async function createHabit(db: GameDatabase, input: HabitInput, now = new Date()): Promise<Habit> {
  const { frequency = { kind: 'daily' }, ...rest } = input
  const last = (await db.habits.toArray()).reduce((max, habit) => Math.max(max, habit.order), -1)
  const habit: Habit = {
    id: crypto.randomUUID(),
    ...rest,
    frequency,
    order: last + 1,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
    archivedDay: null,
  }
  await db.habits.add(habit)
  return habit
}

/** Cambiar la dificultad o la frecuencia no altera el XP ya ganado ni los registros. */
export async function updateHabit(
  db: GameDatabase,
  id: string,
  changes: TaskChanges & { emoji?: string; frequency?: HabitFrequency },
): Promise<void> {
  // Si cambian los objetivos, las casillas marcadas ya no corresponden.
  await db.habits.update(id, changes.steps ? { ...changes, stepsDone: undefined } : changes)
}

/** Archivar conserva el historial y el XP; el hábito deja de tocar desde hoy. */
export async function archiveHabit(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.habits.update(id, { archivedDay: gameDayOf(now) })
}

/** Hábitos archivados, del más reciente al más antiguo. */
export async function getArchivedHabits(db: GameDatabase) {
  return (await db.habits.toArray())
    .filter((habit) => habit.archivedDay !== null)
    .sort((a, b) => b.archivedDay!.localeCompare(a.archivedDay!))
}

/** Vuelve a activar un hábito archivado, con su historial. Vuelve al final de la libreta. */
export async function restoreHabit(db: GameDatabase, id: string): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    const last = (await db.habits.toArray()).reduce((max, habit) => Math.max(max, habit.order), -1)
    await db.habits.update(id, { archivedDay: null, order: last + 1 })
  })
}

/** Mueve un hábito un lugar a la izquierda (-1) o a la derecha (+1) en la libreta. */
export async function moveHabit(db: GameDatabase, id: string, direction: -1 | 1, now = new Date()): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    const habits = await getHabits(db, gameDayOf(now))
    const index = habits.findIndex((habit) => habit.id === id)
    const target = index + direction
    if (index === -1 || target < 0 || target >= habits.length) return
    ;[habits[index], habits[target]] = [habits[target], habits[index]]
    await Promise.all(habits.map((habit, order) => db.habits.update(habit.id, { order })))
  })
}

/**
 * Anota el estado de un hábito un día (`null` lo deja sin registrar). Hoy y ayer dan XP y cuentan para
 * la racha; los días anteriores del mes solo se corrigen como registro, sin tocar el XP.
 * Devuelve el XP ganado con este cambio (0 si no da), o `null` si no se pudo.
 */
export async function setHabitState(
  db: GameDatabase,
  habitId: string,
  day: GameDay,
  state: HabitState | null,
  now = new Date(),
): Promise<number | null> {
  const today = gameDayOf(now)
  const access = dayAccess(day, today)
  if (access === 'none') return null

  return db.transaction('rw', gameTables(db), async () => {
    const habit = await db.habits.get(habitId)
    if (!habit || !isScheduledOn(habit, day)) return null

    if (state === null) await db.habitLogs.delete(logId(habitId, day))
    else await db.habitLogs.put({ id: logId(habitId, day), habitId, day, state })
    if (access === 'log') return 0

    const player = await settleClosedDays(db, today)
    // El bono es el de la racha con la que empezó ese día.
    const streak = day === today ? player.streak : (player.streakBeforeLast ?? player.streak)
    const previous = await db.xpEvents.get({ taskId: habitId, day })
    if (previous) await db.xpEvents.delete(previous.id)
    const stepCount = habit.steps?.length ?? 0
    if (state !== 'done' && state !== 'half') {
      if (day === today && stepCount > 0) await db.habits.update(habitId, { stepsDone: undefined })
      if (day !== today) await resettleYesterday(db, today)
      return 0
    }

    const xp = habitXp(habit.difficulty, streak, state)
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'habit',
      taskId: habitId,
      day,
      xp,
      ...(habit.skillId ? { skillId: habit.skillId } : {}),
    })
    if (day === today && state === 'done' && stepCount > 0) {
      await db.habits.update(habitId, { stepsDone: { day: today, done: allSteps(stepCount) } })
    }
    if (day !== today) await resettleYesterday(db, today)
    return xp
  })
}

/** Marca el hábito como hecho hoy. Devuelve el XP ganado, o `null` si ya estaba hecho o no toca hoy. */
export async function completeHabit(db: GameDatabase, id: string, now = new Date()): Promise<number | null> {
  const today = gameDayOf(now)
  const log = await db.habitLogs.get(logId(id, today))
  if (log?.state === 'done') return null
  return setHabitState(db, id, today, 'done', now)
}

/** Deja el hábito de hoy sin registrar y quita su XP. */
export async function undoHabit(db: GameDatabase, id: string, now = new Date()): Promise<boolean> {
  const today = gameDayOf(now)
  if (!(await db.habitLogs.get(logId(id, today)))) return false
  return (await setHabitState(db, id, today, null, now)) !== null
}

/** Siguiente estado al tocar una casilla de la libreta: vacío → hecho → a medias → no hecho → vacío. */
export function nextHabitState(state: HabitState | null): HabitState | null {
  return state === null ? 'done' : state === 'done' ? 'half' : state === 'half' ? 'missed' : null
}

export interface NotebookCell {
  day: GameDay
  state: HabitState | null
  scheduled: boolean
  access: DayAccess
}

/** Libreta de un mes (`YYYY-MM`): un renglón por día y una columna por hábito. */
export async function getNotebook(db: GameDatabase, month: string, today: GameDay) {
  const first = `${month}-01`
  const [year, monthNumber] = month.split('-').map(Number)
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { month, ...(await getHabitGrid(db, first, addDays(first, length - 1), today)) }
}

/**
 * Hábitos de un rango de días (`first` a `last`, inclusive): una fila por hábito y una casilla por día.
 * El cumplimiento es el del rango; la racha, la de hoy.
 */
export async function getHabitGrid(db: GameDatabase, first: GameDay, last: GameDay, today: GameDay) {
  return db.transaction('r', db.habits, db.habitLogs, async () => {
    const days: GameDay[] = []
    for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)

    // Solo los hábitos activos que ya existían en el rango: los archivados no se muestran (se restauran desde
    // Libreta › Hábitos). Su historial y su XP se conservan.
    const habits = (await db.habits.toArray())
      .filter((habit) => habit.createdDay <= last && habit.archivedDay === null)
      .sort(byOrder)
    const logs = await db.habitLogs
      .where('habitId')
      .anyOf(habits.map((habit) => habit.id))
      .toArray()

    return {
      days: days.map((day) => ({ day, weekday: weekdayOf(day), isToday: day === today, future: day > today })),
      habits: habits.map((habit) => {
        const byDay = new Map(logs.filter((log) => log.habitId === habit.id).map((log) => [log.day, log.state]))
        const cells: NotebookCell[] = days.map((day) => ({
          day,
          state: byDay.get(day) ?? null,
          scheduled: isScheduledOn(habit, day),
          access: dayAccess(day, today),
        }))
        // Cumplimiento del rango hasta hoy: «a medias» cuenta la mitad; hoy solo cuenta si ya se registró.
        const counted = cells.filter(
          (cell) => cell.scheduled && (cell.day < today || (cell.day === today && cell.state)),
        )
        const score = counted.reduce(
          (sum, cell) => sum + (cell.state === 'done' ? 1 : cell.state === 'half' ? 0.5 : 0),
          0,
        )
        return {
          id: habit.id,
          title: habit.title,
          emoji: habit.emoji,
          difficulty: habit.difficulty,
          archived: habit.archivedDay !== null,
          cells,
          rate: counted.length > 0 ? Math.round((score / counted.length) * 100) : null,
          streak: habitStreak(habit, byDay, today),
        }
      }),
    }
  })
}

export type Notebook = Awaited<ReturnType<typeof getNotebook>>
export type HabitGrid = Awaited<ReturnType<typeof getHabitGrid>>
export type NotebookHabit = HabitGrid['habits'][number]

/** Registros de un hábito, por día. */
export async function habitLogsOf(db: GameDatabase, habitId: string): Promise<Map<GameDay, HabitState>> {
  const logs: HabitLog[] = await db.habitLogs.where('habitId').equals(habitId).toArray()
  return new Map(logs.map((log) => [log.day, log.state]))
}
