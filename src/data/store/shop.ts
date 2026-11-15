// Oro, tienda de premios reales, canjes, premios por meta y racha por campaña.
// El oro no se guarda: se calcula del XP ganado (y los actos cerrados) menos lo canjeado, así que
// deshacer una misión o un hábito devuelve su oro sin pasos extra.
import { addDays, gameDayOf, type GameDay } from '../../game/gameDay'
import { ACT_BONUS_GOLD, goldForXp, isResolved } from '../../game/rules'
import type { GameDatabase, Redemption, Reward, RewardGoal } from '../db'
import { buildCampaignView } from './campaigns'
import { habitStreak } from './habits'
import { getMilestones } from './milestones'
import { allTables } from './shared'

export const MAX_REWARD_PRICE = 100_000

/** Oro ganado, gastado y disponible. */
export async function getWallet(db: GameDatabase) {
  const events = await db.xpEvents.toArray()
  const actsClosed = (await getMilestones(db)).filter((item) => item.kind === 'act' || item.kind === 'boss').length
  const earned = events.reduce((sum, event) => sum + goldForXp(event.xp), 0) + actsClosed * ACT_BONUS_GOLD
  const spent = (await db.redemptions.toArray()).reduce((sum, item) => sum + item.cost, 0)
  return { earned, spent, balance: earned - spent }
}

export type Wallet = Awaited<ReturnType<typeof getWallet>>

export interface RewardInput {
  title: string
  emoji?: string
  price?: number
  repeatable?: boolean
  goal?: RewardGoal
}

export async function createReward(db: GameDatabase, input: RewardInput, now = new Date()): Promise<Reward> {
  const reward: Reward = {
    id: crypto.randomUUID(),
    title: input.title.trim().slice(0, 80),
    ...(input.emoji?.trim() ? { emoji: [...input.emoji.trim()].slice(0, 2).join('') } : {}),
    // Los premios por meta no cuestan oro y se ganan una sola vez.
    price: input.goal ? 0 : Math.min(MAX_REWARD_PRICE, Math.max(1, Math.round(input.price ?? 100))),
    repeatable: input.goal ? false : (input.repeatable ?? true),
    createdAt: now.getTime(),
    ...(input.goal ? { goal: input.goal, earnedDay: null } : {}),
  }
  await db.rewards.add(reward)
  return reward
}

export async function updateReward(db: GameDatabase, id: string, input: RewardInput): Promise<void> {
  const reward = await db.rewards.get(id)
  if (!reward) return
  await db.rewards.update(id, {
    title: input.title.trim().slice(0, 80),
    emoji: input.emoji?.trim() ? [...input.emoji.trim()].slice(0, 2).join('') : undefined,
    ...(reward.goal ? {} : { price: Math.min(MAX_REWARD_PRICE, Math.max(1, Math.round(input.price ?? reward.price))) }),
    ...(reward.goal ? {} : { repeatable: input.repeatable ?? reward.repeatable }),
  })
}

/** Lo quita de la tienda; los canjes que ya hubo se conservan en el historial. */
export async function archiveReward(db: GameDatabase, id: string): Promise<void> {
  await db.rewards.update(id, { archived: true })
}

export type RedeemResult = { ok: true; redemption: Redemption } | { ok: false; message: string }

/** Canjea un premio: descuenta su precio (o es gratis si se ganó con una meta) y lo anota en el historial. */
export async function redeemReward(db: GameDatabase, id: string, now = new Date()): Promise<RedeemResult> {
  return db.transaction('rw', allTables(db), async () => {
    const reward = await db.rewards.get(id)
    if (!reward || reward.archived) return { ok: false, message: 'Este premio ya no está en la tienda.' }
    const redeemed = await db.redemptions
      .where('day')
      .above('')
      .filter((item) => item.rewardId === id)
      .count()
    if (!reward.repeatable && redeemed > 0) return { ok: false, message: 'Este premio ya lo canjeaste.' }
    if (reward.goal && !reward.earnedDay) return { ok: false, message: 'Todavía no cumples la meta de este premio.' }
    const cost = reward.goal ? 0 : reward.price
    if ((await getWallet(db)).balance < cost) return { ok: false, message: 'Te falta oro para este premio.' }

    const redemption: Redemption = {
      id: crypto.randomUUID(),
      rewardId: reward.id,
      title: reward.title,
      ...(reward.emoji ? { emoji: reward.emoji } : {}),
      cost,
      day: gameDayOf(now),
      createdAt: now.getTime(),
    }
    await db.redemptions.add(redemption)
    return { ok: true, redemption }
  })
}

/** Cómo va una meta: si se cumple y un texto corto de avance. */
async function goalProgress(db: GameDatabase, goal: RewardGoal, today: GameDay) {
  if (goal.kind === 'quest') {
    const quest = await db.sideQuests.get(goal.targetId)
    return {
      met: Boolean(quest?.completedDay),
      text: quest ? (quest.completedDay ? 'Hecha' : 'Pendiente') : 'Ya no existe',
    }
  }
  if (goal.kind === 'habitStreak') {
    const habit = await db.habits.get(goal.targetId)
    if (!habit) return { met: false, text: 'Ya no existe' }
    const logs = await db.habitLogs.where('habitId').equals(habit.id).toArray()
    const streak = habitStreak(habit, new Map(logs.map((log) => [log.day, log.state])), today)
    return { met: streak >= goal.days, text: `${Math.min(streak, goal.days)} de ${goal.days} días` }
  }
  const campaignId = goal.kind === 'campaign' ? goal.targetId : await findCampaignOfAct(db, goal.targetId)
  const campaign = campaignId ? await db.campaigns.get(campaignId) : undefined
  if (!campaign) return { met: false, text: 'Ya no existe' }
  const view = buildCampaignView(campaign, await db.sideQuests.where('campaignId').equals(campaign.id).toArray())
  if (goal.kind === 'campaign') {
    return { met: view.currentAct === null && view.sideQuests.length > 0, text: `${view.progress} %` }
  }
  const act = view.actViews.find((item) => item.id === goal.targetId)
  if (!act) return { met: false, text: 'Ya no existe' }
  const resolved = act.quests.filter(isResolved).length
  return {
    met: act.state === 'done' && act.status === 'ready' && act.quests.length > 0,
    text: `${resolved} de ${act.quests.length} misiones`,
  }
}

async function findCampaignOfAct(db: GameDatabase, actId: string): Promise<string | null> {
  const campaign = (await db.campaigns.toArray()).find((item) => item.acts?.some((act) => act.id === actId))
  return campaign?.id ?? null
}

/**
 * Revisa los premios por meta pendientes y marca como ganados los que ya se cumplieron.
 * Devuelve los que se ganaron ahora, para avisar al jugador.
 */
export async function checkGoalRewards(db: GameDatabase, today: GameDay): Promise<Reward[]> {
  const pending = (await db.rewards.toArray()).filter((reward) => reward.goal && !reward.earnedDay && !reward.archived)
  const earned: Reward[] = []
  for (const reward of pending) {
    if ((await goalProgress(db, reward.goal!, today)).met) {
      await db.rewards.update(reward.id, { earnedDay: today })
      earned.push({ ...reward, earnedDay: today })
    }
  }
  return earned
}

/** Todo lo que muestra la tienda. */
export async function getShop(db: GameDatabase, today: GameDay) {
  const wallet = await getWallet(db)
  const rewards = (await db.rewards.toArray())
    .filter((reward) => !reward.archived)
    .sort((a, b) => a.createdAt - b.createdAt)
  const history = (await db.redemptions.toArray()).sort((a, b) => b.createdAt - a.createdAt)
  const redeemedIds = new Set(history.map((item) => item.rewardId))
  const usable = rewards.filter((reward) => reward.repeatable || !redeemedIds.has(reward.id))

  const goals = []
  for (const reward of usable.filter((item) => item.goal && !item.earnedDay)) {
    goals.push({ ...reward, progress: (await goalProgress(db, reward.goal!, today)).text })
  }
  return {
    wallet,
    /** Premios por meta ya cumplidos: se canjean gratis. */
    earned: usable.filter((reward) => reward.goal && reward.earnedDay),
    /** Premios con precio en oro. */
    items: usable.filter((reward) => !reward.goal),
    goals,
    history,
  }
}

export type Shop = Awaited<ReturnType<typeof getShop>>

/**
 * Racha de cada campaña: días seguidos con algún avance en ella (una misión completada o saltada,
 * o una misión del día de esa campaña). Hoy sin avance todavía no la rompe.
 */
export async function getCampaignStreaks(db: GameDatabase, today: GameDay): Promise<Record<string, number>> {
  const quests = await db.sideQuests.toArray()
  const dailies = await db.dailies.toArray()
  const daysByCampaign = new Map<string, Set<GameDay>>()
  const add = (campaignId: string | null | undefined, day: GameDay | null | undefined) => {
    if (!campaignId || !day) return
    const set = daysByCampaign.get(campaignId) ?? new Set<GameDay>()
    set.add(day)
    daysByCampaign.set(campaignId, set)
  }
  for (const quest of quests) {
    add(quest.campaignId, quest.completedDay)
    add(quest.campaignId, quest.skippedDay)
  }
  for (const daily of dailies) add(daily.campaignId, daily.completedDay)

  const streaks: Record<string, number> = {}
  for (const [campaignId, days] of daysByCampaign) {
    let day = days.has(today) ? today : addDays(today, -1)
    let streak = 0
    while (days.has(day)) {
      streak += 1
      day = addDays(day, -1)
    }
    streaks[campaignId] = streak
  }
  return streaks
}
