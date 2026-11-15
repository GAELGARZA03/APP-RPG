// Tipos, constantes y piezas internas que comparten todas las áreas del juego.
import { type GameDay, addDays } from '../../game/gameDay'
import { type DayOutcome, type Difficulty, nextStreak } from '../../game/rules'
import type { Bounty, Evidence, GameDatabase, Player, Skill, TaskDetail } from '../db'

export type TaskInput = { title: string; difficulty: Difficulty } & TaskDetail
export type TaskChanges = Partial<TaskInput>

/** Resultado de completar, saltar o marcar un objetivo. */
export interface Outcome {
  ok: boolean
  xp: number
  /** `locked`: la misión está bloqueada. `evidence`: la misión jefe pide una foto o una nota. */
  blocked?: 'locked' | 'evidence'
  boss?: boolean
  /** Presente cuando esta acción cerró un acto. */
  act?: ActCompletion
}

export interface ActCompletion {
  campaignId: string
  campaignTitle: string
  actNumber: number
  actTitle: string
  next: { number: number; title: string; planned: boolean } | null
}

export const FAILED: Outcome = { ok: false, xp: 0 }

export const MAX_PHOTOS_PER_TASK = 4
export const MAX_NOTES_PER_TASK = 6
export const MAX_NOTE_LENGTH = 500
export const MAX_SKILL_NAME = 40

export function isActiveOn(bounty: Bounty, day: GameDay): boolean {
  return bounty.createdDay <= day && (bounty.archivedDay === null || bounty.archivedDay > day)
}

export function outcomeOf(bounties: Bounty[], completedTaskIds: Set<string>, day: GameDay): DayOutcome {
  const active = bounties.filter((bounty) => isActiveOn(bounty, day))
  if (active.length === 0) return 'neutral'
  return active.every((bounty) => completedTaskIds.has(bounty.id)) ? 'fulfilled' : 'failed'
}

export async function completedTaskIdsOn(db: GameDatabase, day: GameDay): Promise<Set<string>> {
  const events = await db.xpEvents.where('day').equals(day).toArray()
  return new Set(events.map((event) => event.taskId))
}

export function byCreation(a: { createdAt: number }, b: { createdAt: number }): number {
  return a.createdAt - b.createdAt
}

export function allSteps(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

/**
 * Calcula la racha con todos los días ya cerrados, sin escribir nada.
 * La racha guardada solo se actualiza cuando hay un cambio (ver `settleClosedDays`).
 */
export async function projectPlayer(db: GameDatabase, today: GameDay): Promise<Player> {
  const yesterday = addDays(today, -1)
  const player = (await db.player.get('player')) ?? {
    id: 'player',
    streak: 0,
    lastSettledDay: yesterday,
  }
  if (player.lastSettledDay >= yesterday) return player

  const bounties = await db.bounties.toArray()
  const events = await db.xpEvents.where('day').between(addDays(player.lastSettledDay, 1), today).toArray()

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

export async function settleClosedDays(db: GameDatabase, today: GameDay): Promise<Player> {
  const player = await projectPlayer(db, today)
  await db.player.put(player)
  return player
}

export function gameTables(db: GameDatabase) {
  return [db.bounties, db.sideQuests, db.xpEvents, db.player]
}

export function allTables(db: GameDatabase) {
  return [db.bounties, db.campaigns, db.sideQuests, db.xpEvents, db.player, db.skills, db.evidence, db.dailies]
}

export type TaskRef = { kind: 'bounty' | 'sideQuest' | 'daily'; id: string }

export function pathOf(skills: Map<string, Skill>, skillId: string | undefined): string | null {
  const names: string[] = []
  let id = skillId ?? null
  while (id && names.length < 6) {
    const skill = skills.get(id)
    if (!skill) break
    names.unshift(skill.name)
    id = skill.parentId
  }
  return names.length > 0 ? names.join(' › ') : null
}

export async function skillMap(db: GameDatabase): Promise<Map<string, Skill>> {
  return new Map((await db.skills.toArray()).map((skill) => [skill.id, skill]))
}

export async function evidenceOf(db: GameDatabase, taskId: string): Promise<Evidence[]> {
  return (await db.evidence.where('taskId').equals(taskId).toArray()).sort(byCreation)
}
