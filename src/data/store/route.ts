// Ruta progresiva de hábitos: pocos hábitos a la vez, en versión mínima, que crecen según la constancia real.
// La app solo SUGIERE (subir de nivel, agregar el siguiente o bajar); nunca cambia nada sin que el jugador acepte.
import { addDays, gameDayOf, type GameDay } from '../../game/gameDay'
import type { GameDatabase, Habit, HabitFrequency, HabitState, RouteItem } from '../db'
import { createHabit } from './habits'
import { allTables, isScheduledOn } from './shared'

/** Días que se miran hacia atrás para medir la constancia. */
export const ROUTE_WINDOW_DAYS = 14
/** Días programados mínimos en el nivel actual antes de sugerir algo. */
export const ROUTE_MIN_DAYS = 7
/** Constancia alta (sugiere subir o agregar) y baja (sugiere bajar el nivel). */
export const ROUTE_HIGH = 0.8
export const ROUTE_LOW = 0.5
/** Al decir «Ahora no», la sugerencia vuelve en una semana. */
export const ROUTE_SNOOZE_DAYS = 7

export interface RoutePlanItem {
  title: string
  emoji?: string
  why: string
  levels: string[]
  frequency: HabitFrequency
  principle?: string
}

const credit = (state: HabitState | undefined) => (state === 'done' ? 1 : state === 'half' ? 0.5 : 0)

/**
 * Constancia del hábito en su nivel actual: lo hecho entre lo esperado en los últimos 14 días (sin hoy),
 * contando solo desde que llegó a este nivel. `null` si todavía no hay días suficientes para opinar.
 */
export function consistency(habit: Habit, logs: Map<GameDay, HabitState>, today: GameDay): number | null {
  const since = [habit.levelSince ?? habit.createdDay, habit.createdDay, addDays(today, -ROUTE_WINDOW_DAYS)]
    .sort()
    .at(-1)!
  let scheduled = 0
  let score = 0
  for (let day = since; day < today; day = addDays(day, 1)) {
    if (!isScheduledOn(habit, day)) continue
    scheduled += 1
    score += credit(logs.get(day))
  }
  if (scheduled < ROUTE_MIN_DAYS) return null
  const expected = habit.frequency.kind === 'timesPerWeek' ? (habit.frequency.times * scheduled) / 7 : scheduled
  return Math.min(1, score / expected)
}

export type RouteOffer =
  | { kind: 'levelUp'; nextLevel: string; canAddNext: boolean }
  | { kind: 'master'; canAddNext: boolean }
  | { kind: 'levelDown'; previousLevel: string }

/** Qué sugerir para un paso activo, según su constancia. */
export function offerFor(item: RouteItem, habit: Habit, rate: number | null, hasPending: boolean): RouteOffer | null {
  if (rate === null) return null
  const level = habit.level ?? 0
  if (rate >= ROUTE_HIGH) {
    return level < item.levels.length - 1
      ? { kind: 'levelUp', nextLevel: item.levels[level + 1], canAddNext: hasPending }
      : { kind: 'master', canAddNext: hasPending }
  }
  if (rate < ROUTE_LOW && level > 0) return { kind: 'levelDown', previousLevel: item.levels[level - 1] }
  return null
}

/** La ruta completa, con la constancia y la sugerencia de cada paso activo. */
export async function getRoute(db: GameDatabase, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const items = (await db.routeItems.toArray()).sort((a, b) => a.order - b.order)
    const hasPending = items.some((item) => item.status === 'pending')
    const steps = []
    for (const item of items) {
      const habit = item.habitId ? await db.habits.get(item.habitId) : undefined
      let rate: number | null = null
      let offer: RouteOffer | null = null
      if (habit && item.status !== 'pending') {
        const logs = await db.habitLogs.where('habitId').equals(habit.id).toArray()
        rate = consistency(habit, new Map(logs.map((log) => [log.day, log.state])), today)
        const snoozed = item.snoozedUntil !== undefined && item.snoozedUntil > today
        if (item.status === 'active' && habit.archivedDay === null && !snoozed)
          offer = offerFor(item, habit, rate, hasPending)
      }
      steps.push({
        ...item,
        level: habit?.level ?? 0,
        current: habit ? item.levels[habit.level ?? 0] : item.levels[0],
        archived: habit ? habit.archivedDay !== null : false,
        rate,
        offer,
      })
    }
    return steps
  })
}

export type RouteStep = Awaited<ReturnType<typeof getRoute>>[number]

/** Crea la ruta y activa los primeros `activeCount` hábitos en su versión mínima. Reemplaza los pasos pendientes. */
export async function startRoute(
  db: GameDatabase,
  plan: RoutePlanItem[],
  activeCount: number,
  now = new Date(),
): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    await db.routeItems
      .where('order')
      .above(-1)
      .filter((item) => item.status === 'pending')
      .delete()
    const last = (await db.routeItems.toArray()).reduce((max, item) => Math.max(max, item.order), -1)
    for (const [index, entry] of plan.entries()) {
      const item: RouteItem = {
        id: crypto.randomUUID(),
        order: last + 1 + index,
        title: entry.title,
        ...(entry.emoji ? { emoji: entry.emoji } : {}),
        why: entry.why,
        levels: entry.levels,
        frequency: entry.frequency,
        ...(entry.principle ? { principle: entry.principle } : {}),
        status: 'pending',
        createdAt: now.getTime() + index,
      }
      await db.routeItems.add(item)
      if (index < activeCount) await activate(db, item, now)
    }
  })
}

async function activate(db: GameDatabase, item: RouteItem, now: Date): Promise<void> {
  const habit = await createHabit(
    db,
    {
      title: item.levels[0],
      difficulty: 1,
      ...(item.emoji ? { emoji: item.emoji } : {}),
      frequency: item.frequency,
      ...(item.principle ? { principle: item.principle } : {}),
      routeItemId: item.id,
      level: 0,
    },
    now,
  )
  await db.routeItems.update(item.id, { status: 'active', habitId: habit.id })
}

async function setLevel(db: GameDatabase, item: RouteItem, level: number, now: Date) {
  if (!item.habitId) return
  await db.habits.update(item.habitId, { level, title: item.levels[level], levelSince: gameDayOf(now) })
}

/** Aplica una sugerencia aceptada. */
export async function acceptRouteOffer(
  db: GameDatabase,
  itemId: string,
  action: 'levelUp' | 'levelDown' | 'master' | 'addNext',
  now = new Date(),
): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const item = await db.routeItems.get(itemId)
    const habit = item?.habitId ? await db.habits.get(item.habitId) : undefined
    if (!item) return
    const level = habit?.level ?? 0
    if (action === 'levelUp' && level < item.levels.length - 1) await setLevel(db, item, level + 1, now)
    if (action === 'levelDown' && level > 0) await setLevel(db, item, level - 1, now)
    if (action === 'master') await db.routeItems.update(item.id, { status: 'mastered' })
    if (action === 'addNext') {
      const next = (await db.routeItems.toArray())
        .filter((candidate) => candidate.status === 'pending')
        .sort((a, b) => a.order - b.order)[0]
      if (next) await activate(db, next, now)
      // Ya cumplió: la sugerencia de este paso descansa hasta que vuelva a medirse en su nivel.
      await db.routeItems.update(item.id, { snoozedUntil: addDays(gameDayOf(now), ROUTE_SNOOZE_DAYS) })
    }
  })
}

/** «Ahora no»: la sugerencia de este paso vuelve en una semana. */
export async function snoozeRouteOffer(db: GameDatabase, itemId: string, now = new Date()): Promise<void> {
  await db.routeItems.update(itemId, { snoozedUntil: addDays(gameDayOf(now), ROUTE_SNOOZE_DAYS) })
}

/** Activa ya el siguiente paso pendiente, sin esperar la sugerencia. */
export async function activateNextRouteItem(db: GameDatabase, now = new Date()): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const next = (await db.routeItems.toArray())
      .filter((item) => item.status === 'pending')
      .sort((a, b) => a.order - b.order)[0]
    if (next) await activate(db, next, now)
  })
}

/** Borra la ruta. Los hábitos que ya se activaron se quedan en la libreta, sin niveles. */
export async function deleteRoute(db: GameDatabase): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    await db.routeItems.clear()
    await db.habits.toCollection().modify((habit) => {
      delete habit.routeItemId
      delete habit.level
      delete habit.levelSince
    })
  })
}
