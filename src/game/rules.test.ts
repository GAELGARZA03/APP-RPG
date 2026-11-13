import { describe, expect, it } from 'vitest'
import { addDays, gameDayOf } from './gameDay'
import {
  baseXp,
  bountyXp,
  campaignProgressPercent,
  campaignState,
  dailyXp,
  levelProgress,
  lockMessage,
  mastery,
  nextStreak,
  questXp,
  skillKey,
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

describe('Progreso con saltadas y jefe', () => {
  it('las misiones saltadas cuentan y el jefe pesa el doble', () => {
    expect(
      campaignProgressPercent([
        { difficulty: 1, completedDay: null, skippedDay: '2026-11-06' },
        { difficulty: 2, completedDay: '2026-11-06' },
        { difficulty: 5, completedDay: null, boss: true },
      ]),
    ).toBe(Math.round((70 / 470) * 100))
  })

  it('el jefe da el doble de XP y la misión del día un 50% más', () => {
    expect(questXp({ difficulty: 5, boss: true })).toBe(400)
    expect(questXp({ difficulty: 3 })).toBe(90)
    expect(dailyXp(1)).toBe(30)
    expect(dailyXp(2)).toBe(75)
  })
})

describe('Estado de los actos', () => {
  const acts = [
    { id: 'a1', status: 'ready' as const },
    { id: 'a2', status: 'ready' as const },
    { id: 'a3', status: 'planned' as const },
  ]
  const quest = (id: string, actId: string, done = false, extra = {}) => ({
    id,
    actId,
    completedDay: done ? '2026-11-06' : null,
    ...extra,
  })

  it('solo el primer acto sin terminar está abierto', () => {
    const state = campaignState(acts, [quest('q1', 'a1'), quest('q2', 'a2'), quest('jefe', 'a3', false, { boss: true })])

    expect(state.states).toEqual(['current', 'locked', 'locked'])
    expect(state.currentIndex).toBe(0)
    expect(state.locks.get('q1')).toBeNull()
    expect(state.locks.get('q2')).toEqual({ kind: 'act', actNumber: 1 })
    expect(lockMessage(state.locks.get('jefe')!)).toBe('Completa el Acto 1 para desbloquear')
  })

  it('un acto sin generar nunca cuenta como terminado y retiene al jefe', () => {
    const state = campaignState(acts, [quest('q1', 'a1', true), quest('q2', 'a2', true), quest('jefe', 'a3', false, { boss: true })])

    expect(state.states).toEqual(['done', 'done', 'current'])
    expect(state.locks.get('jefe')).toEqual({ kind: 'planned', actNumber: 3 })
  })

  it('el jefe se abre al resolver las demás misiones de su acto', () => {
    const lastActs = [{ id: 'a1', status: 'ready' as const }]
    const pending = campaignState(lastActs, [quest('q1', 'a1'), quest('jefe', 'a1', false, { boss: true })])
    const ready = campaignState(lastActs, [quest('q1', 'a1', false, { skippedDay: '2026-11-06' }), quest('jefe', 'a1', false, { boss: true })])
    const finished = campaignState(lastActs, [quest('q1', 'a1', true), quest('jefe', 'a1', true, { boss: true })])

    expect(pending.locks.get('jefe')).toEqual({ kind: 'boss' })
    expect(ready.locks.get('jefe')).toBeNull()
    expect(finished.currentIndex).toBeNull()
    expect(finished.states).toEqual(['done'])
  })

  it('sin actos (campañas antiguas) todo es un solo acto abierto', () => {
    const state = campaignState(undefined, [quest('q1', 'x'), { id: 'q2', completedDay: null }])

    expect(state.states).toEqual(['current'])
    expect([...state.locks.values()]).toEqual([null, null])
  })
})

describe('Dominio de habilidades', () => {
  it('sube de nivel en los umbrales', () => {
    expect(mastery(0)).toMatchObject({ level: 0, name: 'Novato', xpToNext: 100, nextName: 'Aprendiz' })
    expect(mastery(99).level).toBe(0)
    expect(mastery(100)).toMatchObject({ level: 1, name: 'Aprendiz', xpIntoLevel: 0, xpToNext: 200 })
    expect(mastery(300).name).toBe('Competente')
    expect(mastery(700).name).toBe('Experto')
    expect(mastery(5000)).toMatchObject({ level: 4, name: 'Maestro', xpToNext: null, nextName: null })
  })

  it('compara nombres de habilidades sin acentos, mayúsculas ni signos', () => {
    expect(skillKey('  Acordes Abiertos ')).toBe(skillKey('acordes-abiertos'))
    expect(skillKey('Música')).toBe(skillKey('MUSICA'))
    expect(skillKey('Ritmo')).not.toBe(skillKey('Repertorio'))
    expect(skillKey('···')).toBe('')
  })
})
