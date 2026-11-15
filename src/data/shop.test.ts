import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { guitarDesign } from '../test/fixtures'
import { GameDatabase } from './db'
import {
  acceptCampaignPlan,
  addEvidence,
  checkGoalRewards,
  completeHabit,
  completeQuest,
  createHabit,
  createReward,
  getCampaign,
  getCampaignStreaks,
  getMilestones,
  getShop,
  getWallet,
  redeemReward,
  undoHabit,
} from './gameStore'

/** Mediodía del día `offset`, contado desde el lunes 2 de noviembre de 2026. */
const at = (offset: number, hour = 12) => new Date(2026, 10, 2 + offset, hour)
const dayOf = (offset: number) => gameDayOf(at(offset))

let db: GameDatabase
beforeEach(() => {
  db = new GameDatabase(`tienda-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await db.delete()
})

describe('Oro', () => {
  it('sale del XP (1 por cada 10) y deshacer lo devuelve', async () => {
    const habit = await createHabit(db, { title: 'Correr', difficulty: 5 }, at(0))
    await completeHabit(db, habit.id, at(0))
    expect(await getWallet(db)).toEqual({ earned: 20, spent: 0, balance: 20 })
    await undoHabit(db, habit.id, at(0))
    expect((await getWallet(db)).balance).toBe(0)
  })

  it('cerrar un acto da 20 de oro extra', async () => {
    const campaign = await acceptCampaignPlan(db, { ...guitarDesign, habits: [] }, at(0))
    const quests = (await getCampaign(db, campaign.id))!.actViews[0].quests
    for (const quest of quests) await completeQuest(db, quest.id, at(0))
    const fromXp = quests.reduce((sum, quest) => sum + Math.round(quest.xp / 10), 0)
    expect((await getWallet(db)).earned).toBe(fromXp + 20)
  })
})

describe('Tienda', () => {
  it('canjea con oro suficiente, guarda el historial y respeta los de una sola vez', async () => {
    const habit = await createHabit(db, { title: 'Correr', difficulty: 5 }, at(0))
    await completeHabit(db, habit.id, at(0))
    const pizza = await createReward(db, { title: 'Pizza', emoji: '🍕', price: 15, repeatable: false }, at(0))
    const movie = await createReward(db, { title: 'Película', price: 50 }, at(0))

    expect(await redeemReward(db, movie.id, at(0))).toEqual({ ok: false, message: 'Te falta oro para este premio.' })
    expect(await redeemReward(db, pizza.id, at(0))).toMatchObject({
      ok: true,
      redemption: { title: 'Pizza', cost: 15 },
    })
    expect((await getWallet(db)).balance).toBe(5)
    expect(await redeemReward(db, pizza.id, at(0))).toEqual({ ok: false, message: 'Este premio ya lo canjeaste.' })

    const shop = await getShop(db, dayOf(0))
    expect(shop.items.map((item) => item.title)).toEqual(['Película'])
    expect(shop.history.map((item) => item.title)).toEqual(['Pizza'])
    expect(
      (await getMilestones(db)).some((item) => item.kind === 'reward' && item.title === 'Canjeaste: 🍕 Pizza'),
    ).toBe(true)
  })

  it('un premio por meta se gana al cumplirla y se canjea gratis', async () => {
    const habit = await createHabit(db, { title: 'Leer', difficulty: 1 }, at(0))
    const reward = await createReward(
      db,
      { title: 'Pizza', goal: { kind: 'habitStreak', targetId: habit.id, days: 3, label: '3 días seguidos leyendo' } },
      at(0),
    )
    expect(reward).toMatchObject({ price: 0, repeatable: false, earnedDay: null })
    expect(await redeemReward(db, reward.id, at(0))).toMatchObject({ ok: false })

    await completeHabit(db, habit.id, at(0))
    await completeHabit(db, habit.id, at(1))
    expect(await checkGoalRewards(db, dayOf(1))).toEqual([])
    expect((await getShop(db, dayOf(1))).goals[0].progress).toBe('2 de 3 días')
    await completeHabit(db, habit.id, at(2))
    expect((await checkGoalRewards(db, dayOf(2))).map((item) => item.title)).toEqual(['Pizza'])
    expect((await getShop(db, dayOf(2))).earned.map((item) => item.title)).toEqual(['Pizza'])

    const before = (await getWallet(db)).balance
    expect(await redeemReward(db, reward.id, at(2))).toMatchObject({ ok: true, redemption: { cost: 0 } })
    expect((await getWallet(db)).balance).toBe(before)
    expect((await getShop(db, dayOf(2))).earned).toEqual([])
  })

  it('un premio por terminar una campaña se gana al derrotar al jefe', async () => {
    const campaign = await acceptCampaignPlan(
      db,
      { ...guitarDesign, habits: [], acts: guitarDesign.acts.slice(0, 1) },
      at(0),
    )
    await createReward(
      db,
      { title: 'Concierto', goal: { kind: 'campaign', targetId: campaign.id, label: campaign.title } },
      at(0),
    )
    const view = (await getCampaign(db, campaign.id))!
    for (const quest of view.sideQuests.filter((item) => !item.boss)) await completeQuest(db, quest.id, at(0))
    expect(await checkGoalRewards(db, dayOf(0))).toEqual([])
    const boss = view.sideQuests.find((item) => item.boss)!
    await addEvidence(db, { kind: 'sideQuest', id: boss.id }, { note: 'Lo logré' }, at(1))
    expect(await completeQuest(db, boss.id, at(1))).toMatchObject({ ok: true })
    expect((await checkGoalRewards(db, dayOf(1))).map((item) => item.title)).toEqual(['Concierto'])
  })
})

describe('Racha por campaña', () => {
  it('cuenta los días seguidos con avance; hoy sin avance no la rompe', async () => {
    const campaign = await acceptCampaignPlan(db, { ...guitarDesign, habits: [] }, at(0))
    const [first, second] = (await getCampaign(db, campaign.id))!.actViews[0].quests
    await completeQuest(db, first.id, at(0))
    await completeQuest(db, second.id, at(1))
    expect((await getCampaignStreaks(db, dayOf(2)))[campaign.id]).toBe(2)
    expect((await getCampaignStreaks(db, dayOf(4)))[campaign.id]).toBe(0)
  })
})
