import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateWeeklyReview, reviewInput } from '../ai/gemini'
import { addDays, type GameDay } from '../game/gameDay'
import type { HttpRequest } from '../platform/http'
import { generateReply, guitarDesign, interactionReply } from '../test/fixtures'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { GameDatabase } from './db'
import {
  acceptCampaignPlan,
  applyAdjustment,
  completeHabit,
  completeQuest,
  createHabit,
  dismissAdjustment,
  dismissEmptyWeek,
  getCampaign,
  getHud,
  getReview,
  getReviewCard,
  getWeekReport,
  planToReview,
  saveReview,
  weekStartOf,
  type ReviewPlan,
} from './gameStore'

const weekStart = weekStartOf('2026-11-05')
const on = (day: GameDay, hour = 12) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, hour)
}
const dayOf = (offset: number) => addDays(weekStart, offset)

let db: GameDatabase
afterEach(async () => {
  await db?.delete()
})

/** Una semana variada: avance, un acto cerrado, un contrato fallado y una misión atascada. */
async function variedWeek() {
  db = new GameDatabase(`revision-${crypto.randomUUID()}`)
  const water = await createHabit(db, { title: 'Tomar agua', difficulty: 1 }, on(addDays(weekStart, -10)))
  const read = await createHabit(db, { title: 'Leer 20 minutos', difficulty: 1 }, on(addDays(weekStart, -10)))
  // Semana anterior: cumplida los últimos 3 días, racha 3 al empezar.
  for (const offset of [-3, -2, -1]) {
    await completeHabit(db, water.id, on(dayOf(offset)))
    await completeHabit(db, read.id, on(dayOf(offset)))
  }
  // Esta semana: agua todos los días, lectura solo 2 de 7.
  for (let offset = 0; offset < 7; offset++) await completeHabit(db, water.id, on(dayOf(offset)))
  for (const offset of [0, 3]) await completeHabit(db, read.id, on(dayOf(offset)))

  // Campaña creada 9 días antes; esta semana se completan 2 de las 3 misiones del Acto 1.
  const guitar = await acceptCampaignPlan(db, { ...guitarDesign, habits: [] }, on(addDays(weekStart, -9)))
  const [tune, chords, progression] = (await getCampaign(db, guitar.id))!.actViews[0].quests
  await completeQuest(db, tune.id, on(dayOf(1)))
  await completeQuest(db, chords.id, on(dayOf(4)))
  return { water, read, guitar, progression }
}

describe('Resumen de la semana', () => {
  it('cuenta misiones, contratos día por día, racha y misiones atascadas', async () => {
    const { progression } = await variedWeek()
    const report = await getWeekReport(db, weekStart)

    expect(report.hasActivity).toBe(true)
    expect(report.completed.map((item) => item.title)).toHaveLength(2)
    expect(report.habits.find((item) => item.title === 'Leer 20 minutos')).toMatchObject({ done: 2, scheduled: 7 })
    expect(report.habits.find((item) => item.title === 'Tomar agua')?.days).toBe('✓✓✓✓✓✓✓')
    expect(report.streakStart).toBe(3)
    // Todos los días hubo algo hecho (el agua), así que la racha general sube los 7 días.
    expect(report.streakEnd).toBe(10)
    // La tercera misión está desbloqueada desde que se creó la campaña (9 días antes): atascada.
    const stuck = report.stuck.find((item) => item.title === progression.title)
    expect(stuck?.days).toBeGreaterThanOrEqual(5)
    expect(report.refs[stuck!.ref]).toMatchObject({ kind: 'sideQuest', id: progression.id })
  })

  it('una semana sin nada no tiene actividad', async () => {
    db = new GameDatabase(`revision-${crypto.randomUUID()}`)
    await createHabit(db, { title: 'Tomar agua', difficulty: 1 }, on(addDays(weekStart, -3)))
    expect((await getWeekReport(db, weekStart)).hasActivity).toBe(false)
  })

  it('el texto para la IA trae referencias y datos, nunca ids internos', async () => {
    const { progression } = await variedWeek()
    const input = reviewInput(await getWeekReport(db, weekStart))
    expect(input).toContain('«Leer 20 minutos»')
    expect(input).toMatch(/m\d+ «/)
    expect(input).not.toContain(progression.id)
  })
})

const plan = (report: Awaited<ReturnType<typeof getWeekReport>>): ReviewPlan => {
  const stuckRef = report.stuck[0].ref
  const readRef = report.habits.find((item) => item.title === 'Leer 20 minutos')!.ref
  return {
    summary: 'Semana sólida con la guitarra; la lectura se quedó atrás.',
    wins: ['Tomaste agua los 7 días'],
    stuck: [{ ref: stuckRef, title: 'Progresión', cause: 'Es demasiado grande para una sesión' }],
    adjustments: [
      {
        kind: 'split',
        ref: stuckRef,
        reason: 'Lleva días sin avanzar',
        parts: [
          {
            title: 'Toca la progresión lento',
            difficulty: 1,
            description: 'A 50 bpm.',
            steps: ['5 vueltas', 'Sin parar'],
          },
          {
            title: 'Toca la progresión a tempo',
            difficulty: 2,
            description: 'A 80 bpm.',
            steps: ['5 vueltas', 'Graba'],
          },
        ],
      },
      { kind: 'archiveHabit', ref: readRef, reason: 'Solo 2 de 7 días' },
      {
        kind: 'addHabit',
        ref: '',
        reason: 'Para no perder la lectura',
        habit: { title: 'Leer 1 página', difficulty: 1, steps: ['Abre el libro', 'Lee una página'] },
      },
      { kind: 'difficulty', ref: 'm99', reason: 'Referencia inventada', difficulty: 3 },
      { kind: 'archiveHabit', ref: stuckRef, reason: 'Tipo equivocado' },
    ],
    focus: [{ ref: stuckRef, title: 'Progresión', why: 'Destraba el Acto 2' }],
  }
}

describe('Guardar y aplicar la revisión', () => {
  it('descarta ajustes con referencias inválidas y traduce las referencias a ids', async () => {
    const { progression, read } = await variedWeek()
    const report = await getWeekReport(db, weekStart)
    const review = planToReview(plan(report), report, 'modelo')

    expect(review.adjustments.map((item) => item.kind)).toEqual(['split', 'archiveHabit', 'addHabit'])
    expect(review.adjustments[0]).toMatchObject({ questId: progression.id, targetTitle: progression.title })
    expect(review.adjustments[1]).toMatchObject({ habitId: read.id })
    expect(review.focus[0].questId).toBe(progression.id)
  })

  it('dividir reemplaza la misión dentro de su acto sin tocar el XP ni el bloqueo', async () => {
    const { guitar, progression, read } = await variedWeek()
    const report = await getWeekReport(db, weekStart)
    await saveReview(db, planToReview(plan(report), report, 'modelo'))
    const review = (await getReview(db, weekStart))!
    const today = dayOf(8)
    const xpBefore = (await getHud(db, today)).totalXp
    const actBefore = (await getCampaign(db, guitar.id))!.actViews[0]

    const [split, archive, add] = review.adjustments
    expect(await applyAdjustment(db, weekStart, split.id, on(today))).toEqual({ ok: true })
    const actAfter = (await getCampaign(db, guitar.id))!.actViews[0]
    expect(actAfter.quests.map((quest) => quest.title)).toEqual([
      ...actBefore.quests.filter((quest) => quest.id !== progression.id).map((quest) => quest.title),
      'Toca la progresión lento',
      'Toca la progresión a tempo',
    ])
    expect(actAfter.quests.every((quest) => quest.lock === null)).toBe(true)
    expect((await getCampaign(db, guitar.id))!.actViews[1].state).toBe('locked')

    expect(await applyAdjustment(db, weekStart, archive.id, on(today))).toEqual({ ok: true })
    expect((await db.habits.get(read.id))!.archivedDay).toBe(today)
    expect(await applyAdjustment(db, weekStart, add.id, on(today))).toEqual({ ok: true })
    expect(await db.habits.filter((habit) => habit.title === 'Leer 1 página').count()).toBe(1)

    expect((await getHud(db, today)).totalXp).toBe(xpBefore)
    expect((await getReview(db, weekStart))!.adjustments.map((item) => item.status)).toEqual([
      'applied',
      'applied',
      'applied',
    ])
    // Aplicar dos veces no hace nada.
    expect((await applyAdjustment(db, weekStart, split.id, on(today))).ok).toBe(false)
  })

  it('no aplica un ajuste si la misión ya se completó, y se puede descartar', async () => {
    const { progression } = await variedWeek()
    const report = await getWeekReport(db, weekStart)
    await saveReview(db, planToReview(plan(report), report, 'modelo'))
    const [split, archive] = (await getReview(db, weekStart))!.adjustments
    await completeQuest(db, progression.id, on(dayOf(8)))

    expect(await applyAdjustment(db, weekStart, split.id, on(dayOf(8)))).toEqual({
      ok: false,
      message: 'La misión ya está completada.',
    })
    await dismissAdjustment(db, weekStart, archive.id)
    expect((await getReview(db, weekStart))!.adjustments[1].status).toBe('dismissed')
  })

  it('las revisiones viajan en el respaldo', async () => {
    await variedWeek()
    const report = await getWeekReport(db, weekStart)
    await saveReview(db, planToReview(plan(report), report, 'modelo'))
    const backup = parseBackup(JSON.stringify(await createBackup(db)))
    const target = new GameDatabase(`revision-${crypto.randomUUID()}`)
    await restoreBackup(target, backup)
    expect(await getReview(target, weekStart)).toEqual(await getReview(db, weekStart))
    await target.delete()
  })
})

describe('Tarjeta de Hoy', () => {
  it('aparece la semana siguiente, y una semana vacía se puede ocultar', async () => {
    await variedWeek()
    const nextMonday = dayOf(7)
    expect(await getReviewCard(db, nextMonday)).toMatchObject({ weekStart, review: null, empty: false })

    const empty = addDays(weekStart, 14)
    const card = await getReviewCard(db, addDays(empty, 7))
    expect(card).toMatchObject({ weekStart: empty, empty: true })
    await dismissEmptyWeek(db, empty)
    expect(await getReviewCard(db, addDays(empty, 7))).toBeNull()
  })

  it('no aparece si el jugador todavía no existía esa semana', async () => {
    db = new GameDatabase(`revision-${crypto.randomUUID()}`)
    await createHabit(db, { title: 'Tomar agua', difficulty: 1 }, on(dayOf(9)))
    expect(await getReviewCard(db, dayOf(9))).toBeNull()
  })
})

describe('Llamada a Gemini', () => {
  it('con razonamiento usa la API Interactions, con esquema, y valida la respuesta', async () => {
    await variedWeek()
    const report = await getWeekReport(db, weekStart)
    const payload = plan(report)
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 200, data: interactionReply(payload) })
    const result = await generateWeeklyReview(request, {
      apiKey: 'llave',
      model: 'gemini-4-hydrogen',
      thinking: 'medium',
      report,
    })

    const sent = request.mock.calls[0][0]
    expect(sent.url).toContain('/interactions')
    expect(sent.body).toMatchObject({ generation_config: { thinking_level: 'medium' } })
    expect(JSON.stringify(sent.body)).toContain('archiveHabit')
    expect(result.summary).toBe(payload.summary)
    expect(result.adjustments).toHaveLength(4)
  })

  it('en modo ahorro (sin razonamiento) usa generateContent', async () => {
    await variedWeek()
    const report = await getWeekReport(db, weekStart)
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 200, data: generateReply(plan(report)) })
    await generateWeeklyReview(request, { apiKey: 'llave', model: 'gemini-3.5-flash-lite', report })
    expect(request.mock.calls[0][0].url).toContain(':generateContent')
  })
})
