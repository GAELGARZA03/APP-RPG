import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { GameDatabase } from './db'
import {
  acceptRouteOffer,
  completeHabit,
  createHabit,
  getHabitGrid,
  getRoute,
  getTodayHabits,
  setHabitState,
  snoozeRouteOffer,
  startRoute,
  type RoutePlanItem,
} from './gameStore'

/** Mediodía del día `offset`, contado desde el lunes 2 de noviembre de 2026. */
const at = (offset: number, hour = 12) => new Date(2026, 10, 2 + offset, hour)
const dayOf = (offset: number) => gameDayOf(at(offset))

let db: GameDatabase
beforeEach(() => {
  db = new GameDatabase(`ruta-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

const plan: RoutePlanItem[] = [
  {
    title: 'Lectura',
    emoji: '📚',
    why: 'Base de todo',
    levels: ['Leer 2 páginas', 'Leer 10 páginas', 'Leer 30 minutos'],
    frequency: { kind: 'daily' },
  },
  {
    title: 'Agua',
    emoji: '💧',
    why: 'Energía',
    levels: ['Tomar 1 vaso al despertar', 'Tomar 2 litros'],
    frequency: { kind: 'daily' },
  },
  {
    title: 'Ejercicio',
    why: 'Salud',
    levels: ['Caminar 10 minutos', 'Correr 20 minutos'],
    frequency: { kind: 'timesPerWeek', times: 3 },
  },
]

async function doDays(habitId: string, from: number, to: number, state: 'done' | 'half' | 'missed' = 'done') {
  for (let offset = from; offset <= to; offset++) await setHabitState(db, habitId, dayOf(offset), state, at(offset))
}

describe('Ruta progresiva', () => {
  it('activa solo los primeros hábitos, en su versión mínima', async () => {
    await startRoute(db, plan, 2, at(0))
    const route = await getRoute(db, dayOf(0))
    expect(route.map((step) => [step.title, step.status, step.current])).toEqual([
      ['Lectura', 'active', 'Leer 2 páginas'],
      ['Agua', 'active', 'Tomar 1 vaso al despertar'],
      ['Ejercicio', 'pending', 'Caminar 10 minutos'],
    ])
    expect((await getTodayHabits(db, dayOf(0))).map((habit) => habit.title)).toEqual([
      'Leer 2 páginas',
      'Tomar 1 vaso al despertar',
    ])
  })

  it('no sugiere nada sin días suficientes; con 80 % o más ofrece subir de nivel o agregar el siguiente', async () => {
    await startRoute(db, plan, 2, at(0))
    const [reading] = await getRoute(db, dayOf(0))
    await doDays(reading.habitId!, 0, 4)
    expect((await getRoute(db, dayOf(5)))[0].offer).toBeNull()

    await doDays(reading.habitId!, 5, 9)
    const step = (await getRoute(db, dayOf(10)))[0]
    expect(step.rate).toBe(1)
    expect(step.offer).toEqual({ kind: 'levelUp', nextLevel: 'Leer 10 páginas', canAddNext: true })

    await acceptRouteOffer(db, step.id, 'levelUp', at(10))
    const after = (await getRoute(db, dayOf(10)))[0]
    expect(after).toMatchObject({ level: 1, current: 'Leer 10 páginas', offer: null })
    // El nombre del hábito sube de nivel y la constancia vuelve a medirse desde hoy.
    expect((await getTodayHabits(db, dayOf(10)))[0].title).toBe('Leer 10 páginas')
  })

  it('con constancia baja ofrece bajar de nivel, y «Ahora no» la pospone una semana', async () => {
    await startRoute(db, plan, 1, at(0))
    const [reading] = await getRoute(db, dayOf(0))
    await acceptRouteOffer(db, reading.id, 'levelUp', at(0))
    await doDays(reading.habitId!, 0, 2)
    await doDays(reading.habitId!, 3, 9, 'missed')
    const step = (await getRoute(db, dayOf(10)))[0]
    expect(step.offer).toEqual({ kind: 'levelDown', previousLevel: 'Leer 2 páginas' })

    await snoozeRouteOffer(db, step.id, at(10))
    expect((await getRoute(db, dayOf(12)))[0].offer).toBeNull()
    expect((await getRoute(db, dayOf(17)))[0].offer).not.toBeNull()
  })

  it('agregar el siguiente activa el próximo paso pendiente', async () => {
    await startRoute(db, plan, 1, at(0))
    const [reading] = await getRoute(db, dayOf(0))
    await acceptRouteOffer(db, reading.id, 'addNext', at(10))
    const route = await getRoute(db, dayOf(10))
    expect(route.map((step) => step.status)).toEqual(['active', 'active', 'pending'])
  })
})

describe('«N veces por semana»', () => {
  it('se puede hacer cualquier día; el cumplimiento y la racha cuentan semanas', async () => {
    const gym = await createHabit(
      db,
      { title: 'Gimnasio', difficulty: 2, frequency: { kind: 'timesPerWeek', times: 3 } },
      at(0),
    )
    // Semana 1 (días 0 a 6): 3 veces. Semana 2 (días 7 a 13): 2 veces hasta el día 11.
    for (const offset of [0, 2, 4, 7, 9]) await completeHabit(db, gym.id, at(offset))

    const today = await getTodayHabits(db, dayOf(11))
    expect(today[0]).toMatchObject({ week: { done: 2, times: 3 }, streak: 1 })
    await completeHabit(db, gym.id, at(11))
    expect((await getTodayHabits(db, dayOf(11)))[0]).toMatchObject({ week: { done: 3, times: 3 }, streak: 2 })

    const grid = await getHabitGrid(db, dayOf(0), dayOf(6), dayOf(7))
    expect(grid.habits[0].cells.every((cell) => cell.scheduled)).toBe(true)
    expect(grid.habits[0].rate).toBe(100)
  })
})

describe('Recordatorios por hábito', () => {
  it('programa los próximos 7 días que toca, sin el de hoy si ya se marcó ni horas pasadas', async () => {
    const { getReminderPlan } = await import('./gameStore')
    // Lunes, miércoles y viernes a las 19:00.
    const gym = await createHabit(
      db,
      { title: 'Gimnasio', difficulty: 2, frequency: { kind: 'weekdays', days: [0, 2, 4] }, reminder: '19:00' },
      at(0),
    )
    await createHabit(db, { title: 'Sin recordatorio', difficulty: 1 }, at(0))

    let plan = await getReminderPlan(db, at(0, 12))
    expect(plan).toHaveLength(1)
    expect(plan[0].at.map((date) => [date.getDate(), date.getHours()])).toEqual([
      [2, 19],
      [4, 19],
      [6, 19],
    ])

    await completeHabit(db, gym.id, at(0, 13))
    plan = await getReminderPlan(db, at(0, 13))
    expect(plan[0].at.map((date) => date.getDate())).toEqual([4, 6])
    // A las 20:00 del miércoles, el de ese día ya pasó.
    plan = await getReminderPlan(db, at(2, 20))
    expect(plan[0].at.map((date) => date.getDate())).toEqual([6, 9])
  })
})
