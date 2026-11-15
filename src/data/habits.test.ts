import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { parseBackup, restoreBackup } from './backup'
import { GameDatabase } from './db'
import {
  archiveHabit,
  completeHabit,
  createHabit,
  getHabits,
  getHud,
  getNotebook,
  getTodayHabits,
  moveHabit,
  nextHabitState,
  setHabitState,
} from './gameStore'

/** Mediodía del día `offset`, contado desde el lunes 2 de noviembre de 2026. */
const at = (offset: number, hour = 12) => new Date(2026, 10, 2 + offset, hour)
const dayOf = (offset: number) => gameDayOf(at(offset))
const totalXp = async (offset: number) => (await getHud(db, dayOf(offset))).totalXp

let db: GameDatabase
beforeEach(() => {
  db = new GameDatabase(`habitos-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

describe('Registro de hábitos', () => {
  it('«a medias» da la mitad del XP y cambiar de estado reemplaza el XP del día', async () => {
    const habit = await createHabit(db, { title: 'Leer', difficulty: 2 }, at(0))
    expect(await setHabitState(db, habit.id, dayOf(0), 'half', at(0))).toBe(25)
    expect(await totalXp(0)).toBe(25)
    expect(await setHabitState(db, habit.id, dayOf(0), 'done', at(0))).toBe(50)
    expect(await totalXp(0)).toBe(50)
    expect(await setHabitState(db, habit.id, dayOf(0), 'missed', at(0))).toBe(0)
    expect(await totalXp(0)).toBe(0)
    expect((await getTodayHabits(db, dayOf(0)))[0]).toMatchObject({ state: 'missed', doneToday: false })
  })

  it('al tocar una casilla pasa de vacío a hecho, a medias, no hecho y otra vez vacío', () => {
    expect([null, 'done', 'half', 'missed'].map((state) => nextHabitState(state as never))).toEqual([
      'done',
      'half',
      'missed',
      null,
    ])
  })

  it('ayer todavía da XP y cuenta para la racha; los días anteriores solo se registran', async () => {
    const habit = await createHabit(db, { title: 'Agua', difficulty: 1 }, at(0))
    expect(await setHabitState(db, habit.id, dayOf(3), 'done', at(4))).toBe(20)
    expect(await setHabitState(db, habit.id, dayOf(1), 'done', at(4))).toBe(0)
    expect(await totalXp(4)).toBe(20)
    expect((await getHud(db, dayOf(4))).streak).toBe(1)
    // El futuro no se puede marcar.
    expect(await setHabitState(db, habit.id, dayOf(5), 'done', at(4))).toBeNull()
  })

  it('un hábito de ciertos días solo se marca los días que toca', async () => {
    // Lunes, miércoles y viernes.
    const habit = await createHabit(
      db,
      { title: 'Gimnasio', difficulty: 3, frequency: { kind: 'weekdays', days: [0, 2, 4] } },
      at(0),
    )
    expect(await setHabitState(db, habit.id, dayOf(1), 'done', at(1))).toBeNull()
    expect(await completeHabit(db, habit.id, at(2))).toBe(90)
    expect((await getTodayHabits(db, dayOf(3))).map((item) => item.title)).toEqual([])
  })
})

describe('Racha por hábito', () => {
  it('los días que no tocan no la rompen, «a medias» la mantiene y hoy sin registrar tampoco la rompe', async () => {
    const habit = await createHabit(
      db,
      { title: 'Gimnasio', difficulty: 1, frequency: { kind: 'weekdays', days: [0, 2, 4] } },
      at(0),
    )
    await completeHabit(db, habit.id, at(0))
    await setHabitState(db, habit.id, dayOf(2), 'half', at(2))
    await completeHabit(db, habit.id, at(4))
    // El lunes siguiente (día 7) aún no se registra: la racha sigue en 3.
    expect((await getTodayHabits(db, dayOf(7)))[0].streak).toBe(3)
    await setHabitState(db, habit.id, dayOf(7), 'missed', at(7))
    expect((await getTodayHabits(db, dayOf(7)))[0].streak).toBe(0)
  })
})

describe('Libreta', () => {
  it('muestra el mes con estados, días que no tocan, acceso por día, cumplimiento y racha', async () => {
    const water = await createHabit(db, { title: 'Agua', emoji: '💧', difficulty: 1 }, at(-1))
    const gym = await createHabit(
      db,
      { title: 'Gimnasio', difficulty: 2, frequency: { kind: 'weekdays', days: [0, 2, 4] } },
      at(-1),
    )
    for (const offset of [0, 1, 2]) await completeHabit(db, water.id, at(offset))
    await setHabitState(db, water.id, dayOf(3), 'half', at(3))
    await completeHabit(db, gym.id, at(0))

    const notebook = await getNotebook(db, '2026-11', dayOf(4))
    expect(notebook.days).toHaveLength(30)
    expect(notebook.days.find((day) => day.isToday)?.day).toBe(dayOf(4))

    const [waterColumn, gymColumn] = notebook.habits
    expect(waterColumn).toMatchObject({ title: 'Agua', emoji: '💧', streak: 4 })
    // Del 1 de noviembre (creado) a ayer: 5 días, 3 hechos y uno a medias. Hoy aún no se registra.
    expect(waterColumn.cells.find((cell) => cell.day === dayOf(3))).toMatchObject({ state: 'half', access: 'xp' })
    expect(waterColumn.cells.find((cell) => cell.day === dayOf(1))?.access).toBe('log')
    expect(waterColumn.cells.find((cell) => cell.day === dayOf(5))?.access).toBe('none')
    expect(waterColumn.rate).toBe(70)
    expect(gymColumn.cells.find((cell) => cell.day === dayOf(1))?.scheduled).toBe(false)
    expect(gymColumn.rate).toBe(50)
  })

  it('incluye un hábito archivado durante el mes, pero no los del mes siguiente', async () => {
    const old = await createHabit(db, { title: 'Viejo', difficulty: 1 }, at(0))
    await archiveHabit(db, old.id, at(10))
    await createHabit(db, { title: 'Diciembre', difficulty: 1 }, new Date(2026, 11, 3, 12))
    const notebook = await getNotebook(db, '2026-11', dayOf(12))
    expect(notebook.habits.map((habit) => [habit.title, habit.archived])).toEqual([['Viejo', true]])
  })

  it('se pueden reordenar', async () => {
    const one = await createHabit(db, { title: 'Uno', difficulty: 1 }, at(0, 9))
    await createHabit(db, { title: 'Dos', difficulty: 1 }, at(0, 10))
    await createHabit(db, { title: 'Tres', difficulty: 1 }, at(0, 11))
    await moveHabit(db, one.id, 1, at(0))
    expect((await getHabits(db, dayOf(0))).map((habit) => habit.title)).toEqual(['Dos', 'Uno', 'Tres'])
    await moveHabit(db, one.id, -1, at(0))
    await moveHabit(db, one.id, -1, at(0))
    expect((await getHabits(db, dayOf(0))).map((habit) => habit.title)).toEqual(['Uno', 'Dos', 'Tres'])
  })
})

describe('Respaldos anteriores a los hábitos', () => {
  it('un respaldo de la versión 3 convierte sus contratos en hábitos diarios con su historial', async () => {
    const legacy = {
      app: 'real-life-rpg',
      version: 3,
      exportedAt: '2026-11-10T12:00:00.000Z',
      data: {
        bounties: [
          { id: 'b2', title: 'Leer', difficulty: 1, createdAt: 2, createdDay: '2026-11-01', archivedDay: null },
          { id: 'b1', title: 'Agua', difficulty: 2, createdAt: 1, createdDay: '2026-11-01', archivedDay: null },
        ],
        campaigns: [],
        sideQuests: [],
        xpEvents: [{ id: 'e1', kind: 'bounty', taskId: 'b1', day: '2026-11-02', xp: 50 }],
        player: [],
        settings: [],
        evidence: [
          {
            id: 'v1',
            taskKind: 'bounty',
            taskId: 'b1',
            taskTitle: 'Agua',
            createdAt: 3,
            day: '2026-11-02',
            note: 'Listo',
          },
        ],
        reviews: [
          {
            id: '2026-11-02',
            createdAt: 4,
            summary: 'Bien',
            wins: [],
            stuck: [],
            focus: [],
            adjustments: [{ id: 'a1', kind: 'archiveBounty', bountyId: 'b2', reason: 'Casi no', status: 'pending' }],
          },
        ],
      },
    }
    await restoreBackup(db, parseBackup(JSON.stringify(legacy)))

    expect(
      (await db.habits.toArray()).sort((a, b) => a.order - b.order).map((habit) => [habit.title, habit.frequency]),
    ).toEqual([
      ['Agua', { kind: 'daily' }],
      ['Leer', { kind: 'daily' }],
    ])
    expect(await db.habitLogs.toArray()).toEqual([
      { id: 'b1:2026-11-02', habitId: 'b1', day: '2026-11-02', state: 'done' },
    ])
    expect((await db.xpEvents.get('e1'))?.kind).toBe('habit')
    expect((await db.evidence.get('v1'))?.taskKind).toBe('habit')
    expect((await db.reviews.get('2026-11-02'))?.adjustments[0]).toMatchObject({ kind: 'archiveHabit', habitId: 'b2' })
    expect(await totalXp(9)).toBe(50)
  })
})

describe('Notas diarias', () => {
  it('una por día: se crea, se edita conservando la fecha de creación, se borra con texto vacío y no admite el futuro', async () => {
    const { getDailyNote, listDailyNotes, saveDailyNote } = await import('./gameStore')
    expect(await saveDailyNote(db, dayOf(0), { text: '  Fui al partido de fútbol  ' }, at(0, 20))).toBe(true)
    expect(await getDailyNote(db, dayOf(0))).toMatchObject({ text: 'Fui al partido de fútbol' })
    const created = (await getDailyNote(db, dayOf(0)))!.createdAt
    await saveDailyNote(db, dayOf(0), { text: 'Fui al partido y ganamos' }, at(0, 22))
    expect(await getDailyNote(db, dayOf(0))).toMatchObject({ text: 'Fui al partido y ganamos', createdAt: created })
    await saveDailyNote(db, dayOf(1), { text: 'Terminé el libro' }, at(1))
    expect((await listDailyNotes(db)).map((note) => note.id)).toEqual([dayOf(1), dayOf(0)])
    await saveDailyNote(db, dayOf(1), { text: '   ' }, at(1))
    expect(await getDailyNote(db, dayOf(1))).toBeNull()
    expect(await saveDailyNote(db, dayOf(3), { text: 'Del futuro' }, at(1))).toBe(false)
  })

  it('la foto se conserva al editar el texto, se quita con null y una nota puede ser solo foto', async () => {
    const { getDailyNote, saveDailyNote } = await import('./gameStore')
    const photo = 'data:image/jpeg;base64,AAAA'
    await saveDailyNote(db, dayOf(0), { text: 'El concierto', photo }, at(0))
    await saveDailyNote(db, dayOf(0), { text: 'El concierto, desde la primera fila' }, at(0))
    expect(await getDailyNote(db, dayOf(0))).toMatchObject({ text: 'El concierto, desde la primera fila', photo })
    await saveDailyNote(db, dayOf(0), { text: '', photo }, at(0))
    expect(await getDailyNote(db, dayOf(0))).toMatchObject({ text: '', photo })
    await saveDailyNote(db, dayOf(0), { text: '', photo: null }, at(0))
    expect(await getDailyNote(db, dayOf(0))).toBeNull()
  })

  it('viajan en el respaldo', async () => {
    const { createBackup } = await import('./backup')
    const { getDailyNote, saveDailyNote } = await import('./gameStore')
    await saveDailyNote(db, dayOf(0), { text: 'Conocí a alguien famoso', photo: 'data:image/jpeg;base64,AAAA' }, at(0))
    const target = new GameDatabase(`habitos-${crypto.randomUUID()}`)
    await restoreBackup(target, parseBackup(JSON.stringify(await createBackup(db))))
    expect(await getDailyNote(target, dayOf(0))).toEqual(await getDailyNote(db, dayOf(0)))
    await target.delete()
  })
})
