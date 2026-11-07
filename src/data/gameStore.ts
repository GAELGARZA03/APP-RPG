import { addDays, gameDayOf, type GameDay } from '../game/gameDay'
import {
  baseXp,
  bountyXp,
  campaignProgressPercent,
  levelProgress,
  nextStreak,
  streakBonusPercent,
  type DayOutcome,
  type Difficulty,
} from '../game/rules'
import type { Bounty, Campaign, GameDatabase, Player, SideQuest } from './db'

function isActiveOn(bounty: Bounty, day: GameDay): boolean {
  return bounty.createdDay <= day && (bounty.archivedDay === null || bounty.archivedDay > day)
}

function outcomeOf(bounties: Bounty[], completedTaskIds: Set<string>, day: GameDay): DayOutcome {
  const active = bounties.filter((bounty) => isActiveOn(bounty, day))
  if (active.length === 0) return 'neutral'
  return active.every((bounty) => completedTaskIds.has(bounty.id)) ? 'fulfilled' : 'failed'
}

async function completedTaskIdsOn(db: GameDatabase, day: GameDay): Promise<Set<string>> {
  const events = await db.xpEvents.where('day').equals(day).toArray()
  return new Set(events.map((event) => event.taskId))
}

function byCreation(a: { createdAt: number }, b: { createdAt: number }): number {
  return a.createdAt - b.createdAt
}

/**
 * Calcula la racha con todos los días ya cerrados, sin escribir nada.
 * La racha guardada solo se actualiza cuando hay un cambio (ver `settleClosedDays`).
 */
async function projectPlayer(db: GameDatabase, today: GameDay): Promise<Player> {
  const yesterday = addDays(today, -1)
  const player = (await db.player.get('player')) ?? {
    id: 'player',
    streak: 0,
    lastSettledDay: yesterday,
  }
  if (player.lastSettledDay >= yesterday) return player

  const bounties = await db.bounties.toArray()
  const events = await db.xpEvents
    .where('day')
    .between(addDays(player.lastSettledDay, 1), today)
    .toArray()

  const completedByDay = new Map<GameDay, Set<string>>()
  for (const event of events) {
    const completed = completedByDay.get(event.day) ?? new Set<string>()
    completed.add(event.taskId)
    completedByDay.set(event.day, completed)
  }

  let { streak, lastSettledDay: day } = player
  while (day < yesterday) {
    day = addDays(day, 1)
    streak = nextStreak(streak, outcomeOf(bounties, completedByDay.get(day) ?? new Set(), day))
  }

  return { ...player, streak, lastSettledDay: yesterday }
}

async function settleClosedDays(db: GameDatabase, today: GameDay): Promise<Player> {
  const player = await projectPlayer(db, today)
  await db.player.put(player)
  return player
}

function gameTables(db: GameDatabase) {
  return [db.bounties, db.sideQuests, db.xpEvents, db.player]
}

// --- Lecturas -------------------------------------------------------------

export async function getHud(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const events = await db.xpEvents.toArray()
    const bounties = await db.bounties.toArray()
    const completedToday = new Set(
      events.filter((event) => event.day === today).map((event) => event.taskId),
    )
    const todayFulfilled = outcomeOf(bounties, completedToday, today) === 'fulfilled'

    return {
      ...levelProgress(events.reduce((sum, event) => sum + event.xp, 0)),
      streak: player.streak + (todayFulfilled ? 1 : 0),
      streakBonusPercent: streakBonusPercent(player.streak),
      todayFulfilled,
    }
  })
}

export type Hud = Awaited<ReturnType<typeof getHud>>

/** Bounties activas hoy, con su estado y el XP que darían ahora mismo. */
export async function getTodayBounties(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const completed = await completedTaskIdsOn(db, today)
    const bounties = await db.bounties.toArray()

    return bounties
      .filter((bounty) => isActiveOn(bounty, today))
      .sort(byCreation)
      .map((bounty) => ({
        ...bounty,
        doneToday: completed.has(bounty.id),
        xp: bountyXp(bounty.difficulty, player.streak),
      }))
  })
}

export type TodayBounty = Awaited<ReturnType<typeof getTodayBounties>>[number]

export async function getMissions(db: GameDatabase) {
  return db.transaction('r', db.campaigns, db.sideQuests, async () => {
    const campaigns = (await db.campaigns.toArray()).sort(byCreation)
    const sideQuests = (await db.sideQuests.toArray()).sort(byCreation)

    return {
      campaigns: campaigns.map((campaign) => {
        const quests = sideQuests.filter((quest) => quest.campaignId === campaign.id)
        return { ...campaign, sideQuests: quests, progress: campaignProgressPercent(quests) }
      }),
      looseSideQuests: sideQuests.filter((quest) => quest.campaignId === null),
    }
  })
}

export async function getCampaignProgress(db: GameDatabase, campaignId: string): Promise<number> {
  const sideQuests = await db.sideQuests.where('campaignId').equals(campaignId).toArray()
  return campaignProgressPercent(sideQuests)
}

// --- Bounties -------------------------------------------------------------

export async function createBounty(
  db: GameDatabase,
  input: { title: string; difficulty: Difficulty },
  now = new Date(),
): Promise<Bounty> {
  const bounty: Bounty = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
    archivedDay: null,
  }
  await db.bounties.add(bounty)
  return bounty
}

/** Cambiar la dificultad no altera el XP ya ganado. */
export async function updateBounty(
  db: GameDatabase,
  id: string,
  changes: { title?: string; difficulty?: Difficulty },
): Promise<void> {
  await db.bounties.update(id, changes)
}

/** Archivar conserva el historial y el XP; la Bounty deja de contar desde hoy. */
export async function archiveBounty(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.bounties.update(id, { archivedDay: gameDayOf(now) })
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeBounty(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<number | null> {
  const today = gameDayOf(now)

  return db.transaction('rw', gameTables(db), async () => {
    const player = await settleClosedDays(db, today)
    const bounty = await db.bounties.get(id)
    if (!bounty || !isActiveOn(bounty, today)) return null

    const alreadyCompleted = await db.xpEvents.get({ taskId: id, day: today })
    if (alreadyCompleted) return null

    const xp = bountyXp(bounty.difficulty, player.streak)
    await db.xpEvents.add({ id: crypto.randomUUID(), kind: 'bounty', taskId: id, day: today, xp })
    return xp
  })
}

/** Solo se puede deshacer el día en curso: los días cerrados ya contaron para la racha. */
export async function undoBounty(db: GameDatabase, id: string, now = new Date()): Promise<boolean> {
  const event = await db.xpEvents.get({ taskId: id, day: gameDayOf(now) })
  if (!event) return false

  await db.xpEvents.delete(event.id)
  return true
}

// --- Campañas ---------------------------------------------------------------

export async function createCampaign(
  db: GameDatabase,
  title: string,
  now = new Date(),
): Promise<Campaign> {
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    title,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
  }
  await db.campaigns.add(campaign)
  return campaign
}

export async function renameCampaign(db: GameDatabase, id: string, title: string): Promise<void> {
  await db.campaigns.update(id, { title })
}

/** Borra la campaña y sus Side Quests. El XP ya ganado se conserva. */
export async function deleteCampaign(db: GameDatabase, id: string): Promise<void> {
  await db.transaction('rw', db.campaigns, db.sideQuests, async () => {
    await db.sideQuests.where('campaignId').equals(id).delete()
    await db.campaigns.delete(id)
  })
}

// --- Side Quests ------------------------------------------------------------

export async function createSideQuest(
  db: GameDatabase,
  input: { title: string; difficulty: Difficulty; campaignId?: string | null },
  now = new Date(),
): Promise<SideQuest> {
  const sideQuest: SideQuest = {
    id: crypto.randomUUID(),
    title: input.title,
    difficulty: input.difficulty,
    campaignId: input.campaignId ?? null,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
    completedDay: null,
  }
  await db.sideQuests.add(sideQuest)
  return sideQuest
}

export async function updateSideQuest(
  db: GameDatabase,
  id: string,
  changes: { title?: string; difficulty?: Difficulty },
): Promise<void> {
  await db.sideQuests.update(id, changes)
}

/** Borra la Side Quest. El XP ya ganado se conserva; para quitarlo, primero se deshace. */
export async function deleteSideQuest(db: GameDatabase, id: string): Promise<void> {
  await db.sideQuests.delete(id)
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeSideQuest(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<number | null> {
  const today = gameDayOf(now)

  return db.transaction('rw', db.sideQuests, db.xpEvents, async () => {
    const sideQuest = await db.sideQuests.get(id)
    if (!sideQuest || sideQuest.completedDay !== null) return null

    const xp = baseXp(sideQuest.difficulty)
    await db.sideQuests.update(id, { completedDay: today })
    await db.xpEvents.add({ id: crypto.randomUUID(), kind: 'sideQuest', taskId: id, day: today, xp })
    return xp
  })
}

export async function undoSideQuest(db: GameDatabase, id: string): Promise<boolean> {
  return db.transaction('rw', db.sideQuests, db.xpEvents, async () => {
    const sideQuest = await db.sideQuests.get(id)
    if (!sideQuest || sideQuest.completedDay === null) return false

    await db.sideQuests.update(id, { completedDay: null })
    await db.xpEvents.where('taskId').equals(id).delete()
    return true
  })
}
