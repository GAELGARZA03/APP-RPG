import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GameDatabase } from './db'
import {
  archiveBounty,
  completeBounty,
  completeSideQuest,
  createBounty,
  createCampaign,
  createSideQuest,
  getCampaignProgress,
  getHud,
  undoBounty,
  undoSideQuest,
  updateBounty,
} from './gameStore'

/** Mediodía del día `offset`, contado desde el 2 de noviembre de 2026. */
const day = (offset: number, hour = 12) => new Date(2026, 10, 2 + offset, hour)

let db: GameDatabase
let databaseNumber = 0

beforeEach(() => {
  databaseNumber += 1
  db = new GameDatabase(`test-${databaseNumber}`)
})

afterEach(async () => {
  await db.delete()
})

async function completeDays(bountyId: string, from: number, to: number) {
  for (let offset = from; offset <= to; offset += 1) {
    await completeBounty(db, bountyId, day(offset))
  }
}

describe('Bounties', () => {
  it('otorga XP una sola vez por día', async () => {
    const bounty = await createBounty(db, { title: 'Tomar medicamentos', difficulty: 2 }, day(0))

    expect(await completeBounty(db, bounty.id, day(0))).toBe(true)
    expect(await completeBounty(db, bounty.id, day(0))).toBe(false)

    expect(await getHud(db, day(0))).toMatchObject({ level: 1, xpIntoLevel: 50 })
  })

  it('aplica el multiplicador de la racha acumulada', async () => {
    const bounty = await createBounty(db, { title: 'Leer', difficulty: 2 }, day(0))

    await completeDays(bounty.id, 0, 3)

    // 50 + 53 + 55 + 58 = 216: el bono sube al cerrar cada día.
    const hud = await getHud(db, day(3))
    expect(hud).toMatchObject({ level: 2, xpIntoLevel: 116, streak: 4, streakBonusPercent: 15 })
  })

  it('deshace la tarea del día y puede bajar de nivel', async () => {
    const bounty = await createBounty(db, { title: 'Correr', difficulty: 5 }, day(0))
    await completeBounty(db, bounty.id, day(0))
    expect((await getHud(db, day(0))).level).toBe(2)

    expect(await undoBounty(db, bounty.id, day(0))).toBe(true)

    expect(await getHud(db, day(0))).toMatchObject({ level: 1, xpIntoLevel: 0, streak: 0 })
    expect(await completeBounty(db, bounty.id, day(0))).toBe(true)
  })

  it('no deshace tareas de un día ya cerrado', async () => {
    const bounty = await createBounty(db, { title: 'Correr', difficulty: 1 }, day(0))
    await completeBounty(db, bounty.id, day(0))

    expect(await undoBounty(db, bounty.id, day(1))).toBe(false)
  })

  it('cambiar la dificultad no altera el XP ya ganado', async () => {
    const bounty = await createBounty(db, { title: 'Correr', difficulty: 1 }, day(0))
    await completeBounty(db, bounty.id, day(0))

    await updateBounty(db, bounty.id, { difficulty: 5 })

    expect((await getHud(db, day(0))).xpIntoLevel).toBe(20)
  })
})

describe('Rachas', () => {
  it('cuenta el día solo con todas las Bounties activas', async () => {
    const first = await createBounty(db, { title: 'Uno', difficulty: 1 }, day(0))
    const second = await createBounty(db, { title: 'Dos', difficulty: 1 }, day(0))

    await completeBounty(db, first.id, day(0))
    expect(await getHud(db, day(0))).toMatchObject({ streak: 0, todayFulfilled: false })

    await completeBounty(db, second.id, day(0))
    expect(await getHud(db, day(0))).toMatchObject({ streak: 1, todayFulfilled: true })
    expect((await getHud(db, day(1))).streak).toBe(1)
  })

  it('reduce la racha a la mitad al fallar un día', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))
    await completeDays(bounty.id, 0, 8)

    expect((await getHud(db, day(10))).streak).toBe(4)
  })

  it('reduce la racha a la mitad por cada día fallado', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))
    await completeDays(bounty.id, 0, 8)

    expect((await getHud(db, day(12))).streak).toBe(1)
  })

  it('no castiga los días sin Bounties activas', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))
    await completeDays(bounty.id, 0, 3)
    await archiveBounty(db, bounty.id, day(4))

    expect((await getHud(db, day(9))).streak).toBe(4)
  })

  it('una Bounty nueva no afecta los días anteriores', async () => {
    const first = await createBounty(db, { title: 'Uno', difficulty: 1 }, day(0))
    await completeDays(first.id, 0, 1)

    await createBounty(db, { title: 'Dos', difficulty: 1 }, day(2))
    await completeBounty(db, first.id, day(2))

    expect((await getHud(db, day(2))).streak).toBe(2)
  })

  it('completar a las 3:00 a. m. cuenta para el día anterior', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))

    await completeBounty(db, bounty.id, day(1, 3))

    expect(await getHud(db, day(1))).toMatchObject({ streak: 1, todayFulfilled: false })
  })

  it('no cambia el multiplicador durante el mismo día', async () => {
    const first = await createBounty(db, { title: 'Uno', difficulty: 1 }, day(0))
    const second = await createBounty(db, { title: 'Dos', difficulty: 1 }, day(0))

    await completeBounty(db, first.id, day(0))
    await completeBounty(db, second.id, day(0))

    expect((await getHud(db, day(0))).xpIntoLevel).toBe(40)
  })

  it('llega al tope de +50% con 10 días de racha', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))
    await completeDays(bounty.id, 0, 11)

    const events = await db.xpEvents.orderBy('day').toArray()
    expect(events.slice(9).map((event) => event.xp)).toEqual([29, 30, 30])
  })
})

describe('Side Quests y campañas', () => {
  it('no aplica el multiplicador de racha', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 1 }, day(0))
    await completeDays(bounty.id, 0, 3)
    const quest = await createSideQuest(db, { title: 'Trámite', difficulty: 3 }, day(4))

    expect(await completeSideQuest(db, quest.id, day(4))).toBe(true)
    expect(await completeSideQuest(db, quest.id, day(4))).toBe(false)

    const event = await db.xpEvents.get({ taskId: quest.id, day: '2026-11-06' })
    expect(event?.xp).toBe(90)
  })

  it('mueve la barra de su campaña y se puede deshacer', async () => {
    const campaignId = await createCampaign(db, 'Lanzar la app', day(0))
    const small = await createSideQuest(db, { title: 'A', difficulty: 1, campaignId }, day(0))
    await createSideQuest(db, { title: 'B', difficulty: 5, campaignId }, day(0))

    await completeSideQuest(db, small.id, day(0))
    expect(await getCampaignProgress(db, campaignId)).toBe(9)

    await undoSideQuest(db, small.id)
    expect(await getCampaignProgress(db, campaignId)).toBe(0)
    expect((await getHud(db, day(0))).xpIntoLevel).toBe(0)
  })
})

describe('Guardado', () => {
  it('conserva el progreso al reabrir la base de datos', async () => {
    const bounty = await createBounty(db, { title: 'Hábito', difficulty: 2 }, day(0))
    await completeBounty(db, bounty.id, day(0))
    db.close()

    await db.open()

    expect(await getHud(db, day(0))).toMatchObject({ xpIntoLevel: 50, streak: 1 })
  })
})
