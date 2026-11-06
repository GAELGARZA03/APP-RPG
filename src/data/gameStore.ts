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
import type { Bounty, GameDatabase, Player, SideQuest } from './db'

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

/** Aplica a la racha cada día ya cerrado que aún no se haya contado. */
async function settleClosedDays(db: GameDatabase, today: GameDay): Promise<Player> {
  const player = await db.player.get('player')
  if (!player) {
    const firstPlayer: Player = { id: 'player', streak: 0, lastSettledDay: addDays(today, -1) }
    await db.player.add(firstPlayer)
    return firstPlayer
  }

  const bounties = await db.bounties.toArray()
  let { streak, lastSettledDay } = player

  while (lastSettledDay < addDays(today, -1)) {
    lastSettledDay = addDays(lastSettledDay, 1)
    const completedTaskIds = await completedTaskIdsOn(db, lastSettledDay)
    streak = nextStreak(streak, outcomeOf(bounties, completedTaskIds, lastSettledDay))
  }

  const settled = { ...player, streak, lastSettledDay }
  await db.player.put(settled)
  return settled
}

function gameTables(db: GameDatabase) {
  return [db.bounties, db.sideQuests, db.xpEvents, db.player]
}

export async function createBounty(
  db: GameDatabase,
  input: { title: string; difficulty: Difficulty },
  now = new Date(),
): Promise<Bounty> {
  const bounty: Bounty = {
    id: crypto.randomUUID(),
    ...input,
    createdDay: gameDayOf(now),
    archivedDay: null,
  }
  await db.bounties.add(bounty)
  return bounty
}

export async function updateBounty(
  db: GameDatabase,
  id: string,
  changes: { title?: string; difficulty?: Difficulty },
): Promise<void> {
  await db.bounties.update(id, changes)
}

export async function archiveBounty(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.bounties.update(id, { archivedDay: gameDayOf(now) })
}

export async function completeBounty(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const today = gameDayOf(now)

  return db.transaction('rw', gameTables(db), async () => {
    const player = await settleClosedDays(db, today)
    const bounty = await db.bounties.get(id)
    if (!bounty || !isActiveOn(bounty, today)) return false

    const alreadyCompleted = await db.xpEvents.get({ taskId: id, day: today })
    if (alreadyCompleted) return false

    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'bounty',
      taskId: id,
      day: today,
      xp: bountyXp(bounty.difficulty, player.streak),
    })
    return true
  })
}

/** Solo se puede deshacer el día en curso: los días cerrados ya contaron para la racha. */
export async function undoBounty(db: GameDatabase, id: string, now = new Date()): Promise<boolean> {
  const event = await db.xpEvents.get({ taskId: id, day: gameDayOf(now) })
  if (!event) return false

  await db.xpEvents.delete(event.id)
  return true
}

export async function createCampaign(
  db: GameDatabase,
  title: string,
  now = new Date(),
): Promise<string> {
  const id = crypto.randomUUID()
  await db.campaigns.add({ id, title, createdDay: gameDayOf(now) })
  return id
}

export async function createSideQuest(
  db: GameDatabase,
  input: { title: string; difficulty: Difficulty; campaignId?: string },
  now = new Date(),
): Promise<SideQuest> {
  const sideQuest: SideQuest = {
    id: crypto.randomUUID(),
    title: input.title,
    difficulty: input.difficulty,
    campaignId: input.campaignId ?? null,
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

export async function completeSideQuest(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<boolean> {
  const today = gameDayOf(now)

  return db.transaction('rw', db.sideQuests, db.xpEvents, async () => {
    const sideQuest = await db.sideQuests.get(id)
    if (!sideQuest || sideQuest.completedDay !== null) return false

    await db.sideQuests.update(id, { completedDay: today })
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'sideQuest',
      taskId: id,
      day: today,
      xp: baseXp(sideQuest.difficulty),
    })
    return true
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

export async function getCampaignProgress(db: GameDatabase, campaignId: string): Promise<number> {
  const sideQuests = await db.sideQuests.where('campaignId').equals(campaignId).toArray()
  return campaignProgressPercent(sideQuests)
}

export async function getHud(db: GameDatabase, now = new Date()) {
  const today = gameDayOf(now)

  return db.transaction('rw', gameTables(db), async () => {
    const player = await settleClosedDays(db, today)
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
