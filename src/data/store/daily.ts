// Misión del día.
import { type GameDay, gameDayOf } from '../../game/gameDay'
import { dailyXp, isResolved, skillKey } from '../../game/rules'
import type { Daily, GameDatabase } from '../db'
import { getMissions } from './campaigns'
import { FAILED, type Outcome, type TaskInput, allSteps, allTables, byCreation, pathOf, skillMap } from './shared'
import { skillResolver } from './skills'

/** La misión del día de hoy, o `null`. Las de días anteriores ya caducaron. */
export async function getDaily(db: GameDatabase, today: GameDay) {
  const daily = await db.dailies.get(today)
  if (!daily) return null
  return { ...daily, done: daily.completedDay !== null, xp: dailyXp(daily.difficulty) }
}

export type DailyView = NonNullable<Awaited<ReturnType<typeof getDaily>>>

/** Material para pedirle a la IA la misión del día, o `null` si no hay de dónde sacarla. */
export async function getDailyContext(db: GameDatabase, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const missions = await getMissions(db)
    const active = missions.campaigns.filter((campaign) => campaign.currentAct !== null)
    const skills = await skillMap(db)
    const parents = new Set([...skills.values()].map((skill) => skill.parentId))
    const leaves = [...skills.values()].filter((skill) => !parents.has(skill.id)).sort(byCreation)

    if (active.length > 0) {
      // Se rota entre campañas según el día, para que no siempre toque la misma.
      const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000)
      const campaign = active[dayNumber % active.length]
      const act = campaign.actViews[campaign.currentAct! - 1]
      const branchLeaves = leaves.filter((skill) => skill.parentId === campaign.skillId)
      return {
        campaignId: campaign.id as string | null,
        campaign: campaign.title as string | null,
        act: campaign.legacy ? null : { number: act.number, title: act.title, goal: act.goal },
        pending: act.quests
          .filter((quest) => !isResolved(quest) && !quest.boss)
          .map((quest) => quest.title)
          .slice(0, 6),
        branchId: campaign.skillId ?? null,
        skills: branchLeaves.map((skill) => skill.name),
      }
    }
    if (leaves.length === 0) return null
    return {
      campaignId: null,
      campaign: null,
      act: null,
      pending: [] as string[],
      branchId: null as string | null,
      skills: leaves.slice(0, 12).map((skill) => pathOf(skills, skill.id)!),
    }
  })
}

export type DailyContext = NonNullable<Awaited<ReturnType<typeof getDailyContext>>>

/** Guarda la misión del día. Si ya había una para ese día, se conserva la que estaba. */
export async function saveDaily(
  db: GameDatabase,
  input: TaskInput & { skill?: string; campaignId?: string | null; branchId?: string | null },
  now = new Date(),
): Promise<Daily> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    const existing = await db.dailies.get(today)
    if (existing) return existing

    // Las misiones del día sin completar de días anteriores ya caducaron.
    const expired = (await db.dailies.toArray()).filter((daily) => daily.completedDay === null)
    await db.evidence
      .where('taskId')
      .anyOf(expired.map((daily) => daily.id))
      .delete()
    await db.dailies.bulkDelete(expired.map((daily) => daily.id))

    const { skill, campaignId, branchId, ...fields } = input
    let skillId: string | undefined
    if (branchId) {
      skillId = await (await skillResolver(db, 'Misión del día', now)).leaf(branchId, skill)
    } else if (skill) {
      // Sin campaña: solo se enlaza si coincide con una habilidad que ya existe.
      const all = await db.skills.toArray()
      const last = skill.split(/[›>/]/).pop() ?? ''
      skillId = all.find((candidate) => skillKey(candidate.name) === skillKey(last))?.id
    }

    const daily: Daily = {
      id: today,
      ...fields,
      ...(skillId ? { skillId } : {}),
      ...(campaignId ? { campaignId } : {}),
      createdAt: now.getTime(),
      createdDay: today,
      completedDay: null,
    }
    await db.dailies.add(daily)
    return daily
  })
}

/** Da XP extra y suma a su habilidad. No toca la racha: el evento no es de un contrato. */
export async function completeDaily(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', db.dailies, db.xpEvents, async () => {
    const daily = await db.dailies.get(id)
    if (!daily || daily.completedDay !== null) return FAILED
    if (daily.id !== today) return { ...FAILED, blocked: 'locked' as const }

    const xp = dailyXp(daily.difficulty)
    await db.dailies.update(id, { completedDay: today, stepsDone: allSteps(daily.steps?.length ?? 0) })
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'daily',
      taskId: id,
      day: today,
      xp,
      ...(daily.skillId ? { skillId: daily.skillId } : {}),
    })
    return { ok: true, xp }
  })
}

export async function undoDaily(db: GameDatabase, id: string): Promise<boolean> {
  return db.transaction('rw', db.dailies, db.xpEvents, async () => {
    const daily = await db.dailies.get(id)
    if (!daily || daily.completedDay === null) return false

    await db.dailies.update(id, { completedDay: null, stepsDone: [] })
    await db.xpEvents.where('taskId').equals(id).delete()
    return true
  })
}
