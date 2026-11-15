// Misiones del día: tres retos pequeños por día de juego.
import { type GameDay, gameDayOf } from '../../game/gameDay'
import { dailyXp, isResolved, skillKey } from '../../game/rules'
import type { Daily, GameDatabase } from '../db'
import { getMissions } from './campaigns'
import {
  FAILED,
  type Outcome,
  type TaskInput,
  allSteps,
  allTables,
  byCreation,
  gameTables,
  pathOf,
  projectPlayer,
  settleClosedDays,
  skillMap,
} from './shared'
import { skillResolver } from './skills'

export const DAILIES_PER_DAY = 3

/** Las misiones del día de hoy, en orden. Las de días anteriores ya caducaron. */
export async function getDailies(db: GameDatabase, today: GameDay) {
  const dailies = (await db.dailies.where('day').equals(today).toArray()).sort((a, b) => a.slot - b.slot)
  const player = await projectPlayer(db, today)
  return dailies.map((daily) => ({
    ...daily,
    done: daily.completedDay !== null,
    xp: dailyXp(daily.difficulty, player.streak),
  }))
}

export type DailyView = Awaited<ReturnType<typeof getDailies>>[number]

/** Material para pedirle a la IA la misión del día, o `null` si no hay de dónde sacarla. */
export async function getDailyContext(db: GameDatabase, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const missions = await getMissions(db)
    const active = missions.campaigns.filter((campaign) => campaign.currentAct !== null)
    const skills = await skillMap(db)
    const parents = new Set([...skills.values()].map((skill) => skill.parentId))
    const leaves = [...skills.values()].filter((skill) => !parents.has(skill.id)).sort(byCreation)

    const habits = (await db.habits.toArray())
      .filter((habit) => habit.archivedDay === null)
      .sort((a, b) => a.order - b.order)
      .map((habit) => habit.title)
      .slice(0, 12)

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
        habits,
      }
    }
    // Sin campañas, los retos salen de los hábitos y las habilidades.
    if (leaves.length === 0 && habits.length === 0) return null
    return {
      campaignId: null,
      campaign: null,
      act: null,
      pending: [] as string[],
      branchId: null as string | null,
      skills: leaves.slice(0, 12).map((skill) => pathOf(skills, skill.id)!),
      habits,
    }
  })
}

export type DailyContext = NonNullable<Awaited<ReturnType<typeof getDailyContext>>>

export type DailyInput = TaskInput & { skill?: string; kind?: Daily['kind'] }

/**
 * Guarda las misiones del día (hasta tres). Si ya había misiones de hoy, se conservan las que estaban.
 * Al empezar un día nuevo, las de días anteriores sin completar caducan.
 */
export async function saveDailies(
  db: GameDatabase,
  inputs: DailyInput[],
  link: { campaignId?: string | null; branchId?: string | null },
  now = new Date(),
): Promise<Daily[]> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    const existing = await db.dailies.where('day').equals(today).toArray()
    if (existing.length > 0) return existing.sort((a, b) => a.slot - b.slot)

    const expired = (await db.dailies.toArray()).filter((daily) => daily.completedDay === null)
    await db.evidence
      .where('taskId')
      .anyOf(expired.map((daily) => daily.id))
      .delete()
    await db.dailies.bulkDelete(expired.map((daily) => daily.id))

    const saved: Daily[] = []
    for (const [index, input] of inputs.slice(0, DAILIES_PER_DAY).entries()) {
      saved.push(await addDaily(db, input, index + 1, input.kind === 'campaign' ? link : {}, now))
    }
    return saved
  })
}

/** Agrega una misión del día más para hoy (hasta tres). Sirve para pruebas y escenarios. */
export async function saveDaily(
  db: GameDatabase,
  input: DailyInput & { campaignId?: string | null; branchId?: string | null },
  now = new Date(),
): Promise<Daily> {
  const today = gameDayOf(now)
  return db.transaction('rw', allTables(db), async () => {
    const existing = await db.dailies.where('day').equals(today).toArray()
    if (existing.length >= DAILIES_PER_DAY) return existing.sort((a, b) => a.slot - b.slot)[0]
    if (existing.length === 0) {
      const expired = (await db.dailies.toArray()).filter((daily) => daily.completedDay === null)
      await db.dailies.bulkDelete(expired.map((daily) => daily.id))
    }
    const { campaignId, branchId, ...fields } = input
    return addDaily(db, fields, existing.length + 1, { campaignId, branchId }, now)
  })
}

async function addDaily(
  db: GameDatabase,
  input: DailyInput,
  slot: number,
  link: { campaignId?: string | null; branchId?: string | null },
  now: Date,
): Promise<Daily> {
  const today = gameDayOf(now)
  const { skill, kind, ...fields } = input
  let skillId: string | undefined
  if (link.branchId) {
    skillId = await (await skillResolver(db, 'Misión del día', now)).leaf(link.branchId, skill)
  } else if (skill) {
    // Sin campaña: solo se enlaza si coincide con una habilidad que ya existe.
    const all = await db.skills.toArray()
    const last = skill.split(/[›>/]/).pop() ?? ''
    skillId = all.find((candidate) => skillKey(candidate.name) === skillKey(last))?.id
  }

  const daily: Daily = {
    id: `${today}#${slot}`,
    day: today,
    slot,
    ...(kind ? { kind } : {}),
    ...fields,
    ...(skillId ? { skillId } : {}),
    ...(link.campaignId ? { campaignId: link.campaignId } : {}),
    createdAt: now.getTime() + slot,
    createdDay: today,
    completedDay: null,
  }
  await db.dailies.add(daily)
  return daily
}

/** Da XP extra (con el bono de racha), suma a su habilidad y cuenta como día con avance. */
export async function completeDaily(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', [db.dailies, ...gameTables(db)], async () => {
    const daily = await db.dailies.get(id)
    if (!daily || daily.completedDay !== null) return FAILED
    if (daily.day !== today) return { ...FAILED, blocked: 'locked' as const }

    const player = await settleClosedDays(db, today)
    const xp = dailyXp(daily.difficulty, player.streak)
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
