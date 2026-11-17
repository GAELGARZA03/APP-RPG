import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeHabit } from '../ai/gemini'
import type { HttpRequest } from '../platform/http'
import { generateReply } from '../test/fixtures'
import { addDays } from '../game/gameDay'
import { GameDatabase } from './db'
import { createHabit, getHabitStats, habitAnalysisInput, setHabitState, setSleep } from './gameStore'

let db: GameDatabase
beforeEach(() => {
  db = new GameDatabase(`stats-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

/** Como el historial importado de «Mi Pastilla»: del 19 de octubre al 15 de noviembre, sin el viernes 13 ni el domingo 15. */
async function pill() {
  const habit = await createHabit(
    db,
    { title: 'Minoxidil', difficulty: 1, reminder: '21:00' },
    new Date(2026, 9, 19, 12),
  )
  for (let day = '2026-10-19'; day <= '2026-11-15'; day = addDays(day, 1)) {
    const state = day === '2026-11-13' || day === '2026-11-15' ? 'missed' : 'done'
    await db.habitLogs.put({ id: `${habit.id}:${day}`, habitId: habit.id, day, state })
  }
  return habit
}

describe('Detalle del hábito', () => {
  it('cuenta todo el historial, la mejor racha y el día más difícil', async () => {
    const habit = await pill()
    const stats = (await getHabitStats(db, habit.id, '2026-11-16'))!
    expect(stats).toMatchObject({ scheduled: 28, done: 26, missed: 2, unregistered: 0, streak: 0, best: 25 })
    expect(stats.rate).toBeCloseTo(26 / 28)
    expect(stats.weekdays![4]).toMatchObject({ scheduled: 4, rate: 0.75 }) // viernes
    expect(stats.insights.map((item) => item.principle)).toEqual(expect.arrayContaining(['H11', 'H2', 'M3']))

    // Al marcar hoy, la racha empieza en 1 y deja de pedir «no falles dos veces».
    await setHabitState(db, habit.id, '2026-11-16', 'done', new Date(2026, 10, 16, 21, 10))
    const after = (await getHabitStats(db, habit.id, '2026-11-16'))!
    expect(after.streak).toBe(1)
    expect(after.insights.some((item) => item.principle === 'H11')).toBe(false)
  })

  it('guarda la hora al marcar el mismo día y sugiere mover el recordatorio', async () => {
    const habit = await createHabit(db, { title: 'Leer', difficulty: 1, reminder: '08:00' }, new Date(2026, 10, 1, 12))
    // De noche, cerca de las 11:30 p. m.; una vez pasada la medianoche (sigue siendo el mismo día de juego).
    const times: Array<[number, number, number]> = [
      [1, 23, 20],
      [2, 23, 40],
      [3, 23, 30],
      [5, 0, 40],
      [6, 23, 10],
    ]
    for (const [date, hour, minute] of times) {
      const at = new Date(2026, 10, hour < 4 ? date + 1 : date, hour, minute)
      await setHabitState(db, habit.id, `2026-11-0${date}`, 'done', at)
    }
    // Marcar un día atrasado no guarda hora.
    await setHabitState(db, habit.id, '2026-11-07', 'done', new Date(2026, 10, 8, 12))
    expect((await db.habitLogs.get(`${habit.id}:2026-11-07`))?.at).toBeUndefined()

    const stats = (await getHabitStats(db, habit.id, '2026-11-08'))!
    expect(stats.averageTime).toEqual({ minutes: 23 * 60 + 40, samples: 5 })
    const hint = stats.insights.find((item) => item.principle === 'H1')!
    expect(hint.text).toContain('11:40 p. m.')
    expect(hint.text).toContain('8:00 a. m.')
    expect(hint.text).toContain('11:30 p. m.')
  })

  it('el análisis con IA recibe todo el historial, con horas y sueño, y usa la biblioteca', async () => {
    const habit = await pill()
    await setSleep(db, '2026-11-15', 5.5, new Date(2026, 10, 15, 9))
    await setHabitState(db, habit.id, '2026-11-16', 'done', new Date(2026, 10, 16, 21, 10))
    const input = await habitAnalysisInput(db, habit.id, '2026-11-16')
    expect(input).toContain('Hábito: «Minoxidil». Frecuencia: diario.')
    expect(input).toContain('Recordatorio: 9:00 p. m.')
    expect(input).toContain('27 hechos')
    expect(input).toContain('2026-11-13 V: ✗ no lo hizo')
    expect(input).toContain('2026-11-15 D: ✗ no lo hizo; sueño 5.5 h')
    expect(input).toContain('2026-11-16 L: ✓ hecho a las 9:10 p. m.')

    const request = vi.fn<HttpRequest>().mockResolvedValue({
      status: 200,
      data: generateReply({
        summary: 'Vas en 93 %.',
        points: [
          { title: 'Los viernes', text: 'Fallaste un viernes.', principle: 'H2' },
          { title: 'Inventado', text: 'x', principle: 'Z9' },
        ],
      }),
    })
    const plan = await analyzeHabit(request, { apiKey: 'k', model: 'gemini-3.5-flash-lite', input })
    expect(plan.points.map((point) => point.principle)).toEqual(['H2', undefined])
    const sent = request.mock.calls[0][0]
    expect(sent.url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(JSON.stringify(sent.body)).toContain('BIBLIOTECA DE PRINCIPIOS')
  })
})
