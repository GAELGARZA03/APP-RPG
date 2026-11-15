// Tipos, constantes y piezas internas que comparten todas las áreas del juego.
import { type GameDay, addDays, weekdayOf } from '../../game/gameDay'
import { type DayOutcome, type Difficulty, isScheduledWeekday, nextStreak } from '../../game/rules'
import type { Habit, Evidence, GameDatabase, Player, Skill, TaskDetail } from '../db'

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

export function isActiveOn(habit: Habit, day: GameDay): boolean {
  return habit.createdDay <= day && (habit.archivedDay === null || habit.archivedDay > day)
}

/** El hábito existe ese día y le toca según su frecuencia. */
export function isScheduledOn(habit: Habit, day: GameDay): boolean {
  return isActiveOn(habit, day) && isScheduledWeekday(habit.frequency, weekdayOf(day))
}

/**
 * Racha general: un día cuenta si se ganó XP con algo (una misión de campaña o del día, o un hábito
 * hecho o a medias). Un día sin nada la reduce a la mitad.
 */
export function outcomeOf(completedTaskIds: Set<string> | undefined): DayOutcome {
  return completedTaskIds && completedTaskIds.size > 0 ? 'fulfilled' : 'failed'
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
  // Sin racha guardada todavía, se cuenta desde el primer día con XP (sea hábito, misión o misión del día).
  const firstEvent = (await db.xpEvents.orderBy('day').first())?.day
  const player = (await db.player.get('player')) ?? {
    id: 'player',
    streak: 0,
    lastSettledDay: firstEvent && firstEvent <= yesterday ? addDays(firstEvent, -1) : yesterday,
    streakBeforeLast: 0,
  }
  if (player.lastSettledDay >= yesterday) return player

  const events = await db.xpEvents.where('day').between(addDays(player.lastSettledDay, 1), today).toArray()

  const completedByDay = new Map<GameDay, Set<string>>()
  for (const event of events) {
    const completed = completedByDay.get(event.day) ?? new Set<string>()
    completed.add(event.taskId)
    completedByDay.set(event.day, completed)
  }

  let { streak, lastSettledDay: day } = player
  let streakBeforeLast = streak
  while (day < yesterday) {
    day = addDays(day, 1)
    streakBeforeLast = streak
    streak = nextStreak(streak, outcomeOf(completedByDay.get(day)))
  }

  return { ...player, streak, lastSettledDay: yesterday, streakBeforeLast }
}

/**
 * Después de corregir ayer (un hábito marcado o desmarcado tarde), recalcula la racha de ese día.
 * Solo es posible si se conoce la racha con la que empezó ayer.
 */
export async function resettleYesterday(db: GameDatabase, today: GameDay): Promise<void> {
  const player = await db.player.get('player')
  const yesterday = addDays(today, -1)
  if (!player || player.lastSettledDay !== yesterday || player.streakBeforeLast === undefined) return
  const events = await db.xpEvents.where('day').equals(yesterday).toArray()
  const streak = nextStreak(player.streakBeforeLast, outcomeOf(new Set(events.map((event) => event.taskId))))
  if (streak !== player.streak) await db.player.put({ ...player, streak })
}

export async function settleClosedDays(db: GameDatabase, today: GameDay): Promise<Player> {
  const player = await projectPlayer(db, today)
  await db.player.put(player)
  return player
}

export function gameTables(db: GameDatabase) {
  return [db.habits, db.habitLogs, db.sideQuests, db.xpEvents, db.player]
}

export function allTables(db: GameDatabase) {
  return [
    db.habits,
    db.campaigns,
    db.sideQuests,
    db.xpEvents,
    db.player,
    db.skills,
    db.evidence,
    db.dailies,
    db.reviews,
    db.habitLogs,
    db.dailyNotes,
    db.sleep,
  ]
}

export type TaskRef = { kind: 'habit' | 'sideQuest' | 'daily'; id: string }

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
