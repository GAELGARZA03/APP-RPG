// Objetivos marcables de misiones, hábitos y misión del día.
import { gameDayOf } from '../../game/gameDay'
import type { GameDatabase } from '../db'
import { completeHabit, undoHabit } from './habits'
import { completeDaily, undoDaily } from './daily'
import { campaignContext, completeQuest, undoSideQuest } from './quests'
import { FAILED, type Outcome, type TaskRef, allTables, isScheduledOn } from './shared'

function toggled(done: number[], index: number): number[] {
  return done.includes(index) ? done.filter((value) => value !== index) : [...done, index].sort((a, b) => a - b)
}

/**
 * Marca o desmarca un objetivo. Al marcar el último, la misión se completa sola;
 * al desmarcar uno de una misión completada, se deshace.
 */
export async function toggleStep(db: GameDatabase, ref: TaskRef, index: number, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    if (ref.kind === 'habit') {
      const habit = await db.habits.get(ref.id)
      const count = habit?.steps?.length ?? 0
      if (!habit || index < 0 || index >= count || !isScheduledOn(habit, today)) return FAILED
      const done = toggled(habit.stepsDone?.day === today ? habit.stepsDone.done : [], index)
      const completedToday = (await db.xpEvents.get({ taskId: ref.id, day: today })) !== undefined

      if (completedToday && done.length < count) await undoHabit(db, ref.id, now)
      await db.habits.update(ref.id, { stepsDone: { day: today, done } })
      if (!completedToday && done.length === count) {
        const xp = await completeHabit(db, ref.id, now)
        return xp === null ? FAILED : { ok: true, xp }
      }
      return { ok: true, xp: 0 }
    }

    if (ref.kind === 'daily') {
      const daily = await db.dailies.get(ref.id)
      const count = daily?.steps?.length ?? 0
      if (!daily || index < 0 || index >= count || daily.day !== today) return FAILED
      const done = toggled(daily.stepsDone ?? [], index)

      if (daily.completedDay !== null && done.length < count) await undoDaily(db, ref.id)
      await db.dailies.update(ref.id, { stepsDone: done })
      if (daily.completedDay === null && done.length === count) return completeDaily(db, ref.id, now)
      return { ok: true, xp: 0 }
    }

    const quest = await db.sideQuests.get(ref.id)
    const count = quest?.steps?.length ?? 0
    if (!quest || index < 0 || index >= count) return FAILED
    const context = await campaignContext(db, quest)
    if (context?.state.locks.get(ref.id)) return { ...FAILED, blocked: 'locked' as const }
    const done = toggled(quest.stepsDone ?? [], index)

    if (quest.completedDay !== null && done.length < count) await undoSideQuest(db, ref.id)
    await db.sideQuests.update(ref.id, { stepsDone: done })
    if (quest.completedDay === null && done.length === count) {
      const outcome = await completeQuest(db, ref.id, now)
      // Si el jefe aún pide evidencia, las casillas quedan marcadas y se completa al agregarla.
      return outcome.ok || outcome.blocked ? outcome : { ok: true, xp: 0 }
    }
    return { ok: true, xp: 0 }
  })
}
