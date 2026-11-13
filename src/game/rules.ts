export type Difficulty = 1 | 2 | 3 | 4 | 5

export type DayOutcome = 'fulfilled' | 'failed' | 'neutral'

const DIFFICULTY_XP: Record<Difficulty, number> = { 1: 20, 2: 50, 3: 90, 4: 140, 5: 200 }

const STREAK_BONUS_PERCENT_PER_DAY = 5
const MAX_STREAK_BONUS_PERCENT = 50

export function baseXp(difficulty: Difficulty): number {
  return DIFFICULTY_XP[difficulty]
}

/** XP necesaria para pasar de `level` al nivel siguiente. */
export function xpToNextLevel(level: number): number {
  return Math.round(100 * level ** 1.5)
}

export function levelProgress(totalXp: number) {
  let level = 1
  let xpIntoLevel = totalXp

  while (xpIntoLevel >= xpToNextLevel(level)) {
    xpIntoLevel -= xpToNextLevel(level)
    level += 1
  }

  return { level, xpIntoLevel, xpToNext: xpToNextLevel(level) }
}

export function streakBonusPercent(streak: number): number {
  return Math.min(streak * STREAK_BONUS_PERCENT_PER_DAY, MAX_STREAK_BONUS_PERCENT)
}

export function bountyXp(difficulty: Difficulty, streak: number): number {
  // Se calcula con enteros para evitar errores de redondeo de punto flotante.
  return Math.round((baseXp(difficulty) * (100 + streakBonusPercent(streak))) / 100)
}

export function nextStreak(streak: number, outcome: DayOutcome): number {
  switch (outcome) {
    case 'fulfilled':
      return streak + 1
    case 'failed':
      return Math.floor(streak / 2)
    case 'neutral':
      return streak
  }
}

/** Porcentaje de una campaña, según el XP de sus Side Quests completadas o saltadas. */
export function campaignProgressPercent(
  sideQuests: ReadonlyArray<{ difficulty: Difficulty; completedDay: string | null; skippedDay?: string | null; boss?: boolean }>,
): number {
  const totalXp = sideQuests.reduce((sum, quest) => sum + questXp(quest), 0)
  if (totalXp === 0) return 0

  const resolvedXp = sideQuests
    .filter((quest) => quest.completedDay !== null || (quest.skippedDay ?? null) !== null)
    .reduce((sum, quest) => sum + questXp(quest), 0)

  return Math.round((resolvedXp / totalXp) * 100)
}

// --- Actos, bloqueo y misión jefe ---------------------------------------------

/** La misión jefe da el doble de XP que su dificultad. */
export const BOSS_XP_MULTIPLIER = 2

export function questXp(quest: { difficulty: Difficulty; boss?: boolean }): number {
  return baseXp(quest.difficulty) * (quest.boss ? BOSS_XP_MULTIPLIER : 1)
}

/** La misión del día da un 50% más que una misión normal de su dificultad. */
export function dailyXp(difficulty: Difficulty): number {
  return Math.round(baseXp(difficulty) * 1.5)
}

export interface ActLike {
  id: string
  /** `planned`: aún no se generan sus misiones. */
  status: 'planned' | 'ready'
}

export interface QuestLike {
  id: string
  actId?: string | null
  boss?: boolean
  completedDay: string | null
  skippedDay?: string | null
}

export type LockReason =
  | { kind: 'act'; actNumber: number }
  | { kind: 'boss' }
  | { kind: 'planned'; actNumber: number }

export type ActState = 'done' | 'current' | 'locked'

export function isResolved(quest: QuestLike): boolean {
  return quest.completedDay !== null || (quest.skippedDay ?? null) !== null
}

/** Acto único para las campañas creadas antes de que existieran los actos. */
export const LEGACY_ACT: ActLike = { id: 'legacy', status: 'ready' }

/**
 * Estado de cada acto y motivo de bloqueo de cada misión. Todo se deriva de las misiones:
 * así, deshacer una misión de un acto cerrado vuelve a bloquear lo que venía después.
 * Nunca se bloquea por nivel del jugador, solo por progreso dentro de la campaña.
 */
export function campaignState(actsInput: ReadonlyArray<ActLike> | undefined, quests: ReadonlyArray<QuestLike>) {
  const acts = actsInput && actsInput.length > 0 ? actsInput : [LEGACY_ACT]
  const actIndexOf = (quest: QuestLike) => {
    const index = acts.findIndex((act) => act.id === quest.actId)
    return index === -1 ? 0 : index
  }
  const questsByAct = acts.map((_, index) => quests.filter((quest) => actIndexOf(quest) === index))
  const actDone = acts.map((act, index) => act.status === 'ready' && questsByAct[index].every(isResolved))
  const firstOpen = actDone.indexOf(false)
  const currentIndex = firstOpen === -1 ? null : firstOpen

  const states: ActState[] = acts.map((_, index) =>
    currentIndex === null || index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'locked',
  )

  const locks = new Map<string, LockReason | null>()
  for (const [index, actQuests] of questsByAct.entries()) {
    for (const quest of actQuests) {
      let lock: LockReason | null = null
      if (states[index] === 'locked') lock = { kind: 'act', actNumber: (currentIndex ?? 0) + 1 }
      else if (quest.boss && !isResolved(quest)) {
        if (acts[index].status === 'planned') lock = { kind: 'planned', actNumber: index + 1 }
        else if (actQuests.some((other) => !other.boss && !isResolved(other))) lock = { kind: 'boss' }
      }
      locks.set(quest.id, lock)
    }
  }

  return { states, currentIndex, questsByAct, locks }
}

export function lockMessage(reason: LockReason): string {
  switch (reason.kind) {
    case 'act':
      return `Completa el Acto ${reason.actNumber} para desbloquear`
    case 'boss':
      return 'Completa las demás misiones del acto para enfrentar al jefe'
    case 'planned':
      return `Genera las misiones del Acto ${reason.actNumber} para llegar al jefe`
  }
}

// --- Dominio de habilidades ----------------------------------------------------

export const MASTERY_LEVELS = [
  { name: 'Novato', xp: 0 },
  { name: 'Aprendiz', xp: 100 },
  { name: 'Competente', xp: 300 },
  { name: 'Experto', xp: 700 },
  { name: 'Maestro', xp: 1500 },
] as const

/** Nivel de dominio (0 a 4) según el XP acumulado en la habilidad. */
export function mastery(xp: number) {
  let level = 0
  while (level + 1 < MASTERY_LEVELS.length && xp >= MASTERY_LEVELS[level + 1].xp) level += 1
  const next = MASTERY_LEVELS[level + 1] ?? null
  return {
    level,
    name: MASTERY_LEVELS[level].name,
    xpIntoLevel: xp - MASTERY_LEVELS[level].xp,
    xpToNext: next ? next.xp - MASTERY_LEVELS[level].xp : null,
    nextName: next?.name ?? null,
  }
}

/** Compara nombres de habilidades sin acentos, mayúsculas ni signos ("Acordes abiertos" = "acordes-abiertos"). */
export function skillKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
