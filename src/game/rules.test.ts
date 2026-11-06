import { describe, expect, it } from 'vitest'
import { addDays, gameDayOf } from './gameDay'
import {
  baseXp,
  bountyXp,
  campaignProgressPercent,
  levelProgress,
  nextStreak,
  streakBonusPercent,
  xpToNextLevel,
} from './rules'

describe('XP y niveles', () => {
  it('asigna el XP fijo de cada dificultad', () => {
    expect([baseXp(1), baseXp(2), baseXp(3), baseXp(4), baseXp(5)]).toEqual([20, 50, 90, 140, 200])
  })

  it('aplica la fórmula de nivel', () => {
    expect(xpToNextLevel(1)).toBe(100)
    expect(xpToNextLevel(2)).toBe(283)
    expect(xpToNextLevel(10)).toBe(3162)
  })

  it('calcula nivel y avance a partir del XP total', () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNext: 100 })
    expect(levelProgress(99)).toEqual({ level: 1, xpIntoLevel: 99, xpToNext: 100 })
    expect(levelProgress(100)).toEqual({ level: 2, xpIntoLevel: 0, xpToNext: 283 })
    expect(levelProgress(383)).toEqual({ level: 3, xpIntoLevel: 0, xpToNext: 520 })
  })
})

describe('Multiplicador de racha', () => {
  it('suma 5% por día y se detiene en 50%', () => {
    expect(streakBonusPercent(0)).toBe(0)
    expect(streakBonusPercent(1)).toBe(5)
    expect(streakBonusPercent(10)).toBe(50)
    expect(streakBonusPercent(100)).toBe(50)
  })

  it('calcula el XP de la Bounty con el multiplicador', () => {
    expect(bountyXp(1, 0)).toBe(20)
    expect(bountyXp(1, 1)).toBe(21)
    expect(bountyXp(2, 3)).toBe(58)
    expect(bountyXp(5, 10)).toBe(300)
    expect(bountyXp(5, 500)).toBe(300)
  })
})

describe('Racha', () => {
  it('sube, se reduce a la mitad o se mantiene', () => {
    expect(nextStreak(4, 'fulfilled')).toBe(5)
    expect(nextStreak(9, 'failed')).toBe(4)
    expect(nextStreak(1, 'failed')).toBe(0)
    expect(nextStreak(0, 'failed')).toBe(0)
    expect(nextStreak(4, 'neutral')).toBe(4)
  })
})

describe('Cierre del día', () => {
  it('cambia de día a las 4:00 a. m.', () => {
    expect(gameDayOf(new Date(2026, 10, 6, 3, 59))).toBe('2026-11-05')
    expect(gameDayOf(new Date(2026, 10, 6, 4, 0))).toBe('2026-11-06')
    expect(gameDayOf(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06')
  })

  it('cruza meses y años', () => {
    expect(gameDayOf(new Date(2027, 0, 1, 2, 0))).toBe('2026-12-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('Progreso de campaña', () => {
  it('se calcula con el XP completado', () => {
    expect(campaignProgressPercent([])).toBe(0)
    expect(
      campaignProgressPercent([
        { difficulty: 1, completedDay: '2026-11-06' },
        { difficulty: 5, completedDay: null },
      ]),
    ).toBe(9)
  })
})
