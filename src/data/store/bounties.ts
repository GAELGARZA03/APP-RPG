// Contratos diarios (bounties): crear, completar, deshacer y archivar.
import { type GameDay, gameDayOf } from '../../game/gameDay'
import { bountyXp } from '../../game/rules'
import type { Bounty, GameDatabase } from '../db'
import {
  type TaskChanges,
  type TaskInput,
  allSteps,
  byCreation,
  completedTaskIdsOn,
  gameTables,
  isActiveOn,
  projectPlayer,
  settleClosedDays,
} from './shared'

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
        // Los objetivos marcados otro día de juego ya no cuentan.
        stepsDoneToday: bounty.stepsDone?.day === today ? bounty.stepsDone.done.length : 0,
      }))
  })
}

export type TodayBounty = Awaited<ReturnType<typeof getTodayBounties>>[number]

export async function createBounty(
  db: GameDatabase,
  input: TaskInput & { campaignId?: string },
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
export async function updateBounty(db: GameDatabase, id: string, changes: TaskChanges): Promise<void> {
  // Si cambian los objetivos, las casillas marcadas ya no corresponden.
  await db.bounties.update(id, changes.steps ? { ...changes, stepsDone: undefined } : changes)
}

/** Archivar conserva el historial y el XP; la Bounty deja de contar desde hoy. */
export async function archiveBounty(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.bounties.update(id, { archivedDay: gameDayOf(now) })
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeBounty(db: GameDatabase, id: string, now = new Date()): Promise<number | null> {
  const today = gameDayOf(now)

  return db.transaction('rw', gameTables(db), async () => {
    const player = await settleClosedDays(db, today)
    const bounty = await db.bounties.get(id)
    if (!bounty || !isActiveOn(bounty, today)) return null

    const alreadyCompleted = await db.xpEvents.get({ taskId: id, day: today })
    if (alreadyCompleted) return null

    const xp = bountyXp(bounty.difficulty, player.streak)
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'bounty',
      taskId: id,
      day: today,
      xp,
      ...(bounty.skillId ? { skillId: bounty.skillId } : {}),
    })
    const stepCount = bounty.steps?.length ?? 0
    if (stepCount > 0) await db.bounties.update(id, { stepsDone: { day: today, done: allSteps(stepCount) } })
    return xp
  })
}

/** Solo se puede deshacer el día en curso: los días cerrados ya contaron para la racha. */
export async function undoBounty(db: GameDatabase, id: string, now = new Date()): Promise<boolean> {
  return db.transaction('rw', db.bounties, db.xpEvents, async () => {
    const event = await db.xpEvents.get({ taskId: id, day: gameDayOf(now) })
    if (!event) return false

    await db.xpEvents.delete(event.id)
    await db.bounties.update(id, { stepsDone: undefined })
    return true
  })
}
