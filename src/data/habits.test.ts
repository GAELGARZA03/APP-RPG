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

  it('no muestra los archivados ni los del mes siguiente; un archivado se puede restaurar con su historial', async () => {
    const { getArchivedHabits, restoreHabit } = await import('./gameStore')
    const old = await createHabit(db, { title: 'Viejo', difficulty: 1 }, at(0))
    await completeHabit(db, old.id, at(0))
    await archiveHabit(db, old.id, at(10))
    await createHabit(db, { title: 'Activo', difficulty: 1 }, at(0))
    await createHabit(db, { title: 'Diciembre', difficulty: 1 }, new Date(2026, 11, 3, 12))
    expect((await getNotebook(db, '2026-11', dayOf(12))).habits.map((habit) => habit.title)).toEqual(['Activo'])
    expect((await getArchivedHabits(db)).map((habit) => habit.title)).toEqual(['Viejo'])

    await restoreHabit(db, old.id)
    const notebook = await getNotebook(db, '2026-11', dayOf(12))
    expect(notebook.habits.map((habit) => habit.title)).toEqual(['Activo', 'Viejo'])
    expect(notebook.habits[1].cells[1]).toMatchObject({ state: 'done', scheduled: true })
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

  it('varias fotos y videos por día, con límites; el texto se edita sin perderlos', async () => {
    const { addDiaryMedia, getDailyNote, getVideoBlob, noteCover, removeDiaryPhoto, removeDiaryVideo, saveDailyNote } =
      await import('./gameStore')
    const photo = (n: number) => `data:image/jpeg;base64,AAA${n}`
    const video = { blob: new Blob(['video']), duration: 12.34, poster: photo(9) }

    const first = await addDiaryMedia(
      db,
      dayOf(0),
      [1, 2, 3, 4, 5, 6, 7].map((n) => ({ photo: photo(n) })),
      'El concierto',
      at(0),
    )
    expect(first).toEqual({ added: 6, skipped: 1 })
    await addDiaryMedia(db, dayOf(0), [{ video }, { video }, { video }, { video }], undefined, at(0))
    let note = (await getDailyNote(db, dayOf(0)))!
    expect(note.text).toBe('El concierto')
    expect(note.photos).toHaveLength(6)
    expect(note.videos).toHaveLength(3)
    expect(note.videos![0]).toMatchObject({ duration: 12.3, size: 5, poster: photo(9) })
    expect(noteCover(note)).toBe(photo(1))

    await saveDailyNote(db, dayOf(0), { text: 'El concierto, desde la primera fila' }, at(0))
    note = (await getDailyNote(db, dayOf(0)))!
    expect(note.photos).toHaveLength(6)

    await removeDiaryPhoto(db, dayOf(0), 0, at(0))
    note = (await getDailyNote(db, dayOf(0)))!
    expect(note.photos![0]).toBe(photo(2))
    const removed = note.videos![0].id
    await removeDiaryVideo(db, dayOf(0), removed, at(0))
    expect(await getVideoBlob(db, removed)).toBeNull()
    expect((await getDailyNote(db, dayOf(0)))!.videos).toHaveLength(2)

    // Una nota puede ser solo fotos; sin texto ni nada más, desaparece.
    await saveDailyNote(db, dayOf(1), { text: 'x' }, at(1))
    await addDiaryMedia(db, dayOf(1), [{ photo: photo(1) }], '', at(1))
    expect(await getDailyNote(db, dayOf(1))).toMatchObject({ text: '', photos: [photo(1)] })
    await removeDiaryPhoto(db, dayOf(1), 0, at(1))
    expect(await getDailyNote(db, dayOf(1))).toBeNull()
  })

  it('viajan en el respaldo (los videos solo como referencia) y aceptan la foto única de respaldos viejos', async () => {
    const { createBackup } = await import('./backup')
    const { addDiaryMedia, getDailyNote, getVideoBlob } = await import('./gameStore')
    await addDiaryMedia(
      db,
      dayOf(0),
      [{ photo: 'data:image/jpeg;base64,AAAA' }, { video: { blob: new Blob(['v']), duration: 3 } }],
      'Conocí a alguien famoso',
      at(0),
    )
    const target = new GameDatabase(`habitos-${crypto.randomUUID()}`)
    const backup = await createBackup(db)
    await restoreBackup(target, parseBackup(JSON.stringify(backup)))
    const restored = (await getDailyNote(target, dayOf(0)))!
    expect(restored).toEqual(await getDailyNote(db, dayOf(0)))
    expect(await getVideoBlob(target, restored.videos![0].id)).toBeNull()

    const legacy = JSON.parse(JSON.stringify(backup))
    legacy.data.dailyNotes = [
      { id: dayOf(2), text: 'Viejo', photo: 'data:image/jpeg;base64,BBBB', createdAt: 1, updatedAt: 1 },
    ]
    await restoreBackup(target, parseBackup(JSON.stringify(legacy)))
    expect(await getDailyNote(target, dayOf(2))).toEqual({
      id: dayOf(2),
      text: 'Viejo',
      photos: ['data:image/jpeg;base64,BBBB'],
      createdAt: 1,
      updatedAt: 1,
    })
    await target.delete()
  })
})

describe('Sueño', () => {
  it('redondea a la media hora, no admite el futuro, se borra con null y da el promedio del periodo', async () => {
    const { getSleepRange, setSleep } = await import('./gameStore')
    expect(await setSleep(db, dayOf(0), 7.3, at(0))).toBe(true)
    await setSleep(db, dayOf(1), 20, at(1))
    await setSleep(db, dayOf(2), 6, at(2))
    expect(await setSleep(db, dayOf(5), 8, at(2))).toBe(false)

    let range = await getSleepRange(db, dayOf(0), dayOf(3))
    expect(range.days.map((item) => item.hours)).toEqual([7.5, 14, 6, null])
    expect(range.average).toBe(9.2)
    await setSleep(db, dayOf(1), null, at(2))
    range = await getSleepRange(db, dayOf(0), dayOf(3))
    expect(range.average).toBe(6.8)
  })

  it('viaja en el respaldo y no da XP', async () => {
    const { createBackup } = await import('./backup')
    const { setSleep } = await import('./gameStore')
    await setSleep(db, dayOf(0), 8, at(0))
    expect(await totalXp(0)).toBe(0)
    const target = new GameDatabase(`habitos-${crypto.randomUUID()}`)
    await restoreBackup(target, parseBackup(JSON.stringify(await createBackup(db))))
    expect(await target.sleep.toArray()).toEqual([{ id: dayOf(0), hours: 8 }])
    await target.delete()
  })
})

describe('Recuerdos', () => {
  it('prefiere la nota de hace un año y, si no hay, la de hace un mes', async () => {
    const { getMemory, saveDailyNote } = await import('./gameStore')
    const today = '2026-11-15'
    const now = new Date(2026, 10, 15, 12)
    expect(await getMemory(db, today)).toBeNull()
    await saveDailyNote(db, '2026-10-15', { text: 'Primer día de guitarra' }, now)
    expect(await getMemory(db, today)).toMatchObject({ label: 'Hace un mes', note: { text: 'Primer día de guitarra' } })
    await saveDailyNote(db, '2025-11-15', { text: 'Corrí mi primer 5 km' }, now)
    expect(await getMemory(db, today)).toMatchObject({ label: 'Hace un año', note: { text: 'Corrí mi primer 5 km' } })
    // El 31 de marzo no tiene «mismo día» en febrero.
    expect(await getMemory(db, '2026-03-31')).toBeNull()
  })
})
