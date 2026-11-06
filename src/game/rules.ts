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

/** Porcentaje de una campaña, según el XP completado de sus Side Quests. */
export function campaignProgressPercent(
  sideQuests: ReadonlyArray<{ difficulty: Difficulty; completedDay: string | null }>,
): number {
  const totalXp = sideQuests.reduce((sum, quest) => sum + baseXp(quest.difficulty), 0)
  if (totalXp === 0) return 0

  const completedXp = sideQuests
    .filter((quest) => quest.completedDay !== null)
    .reduce((sum, quest) => sum + baseXp(quest.difficulty), 0)

  return Math.round((completedXp / totalXp) * 100)
}
