// Vista de detalle de una misión, un hábito o la misión del día.
import type { GameDay } from '../../game/gameDay'
import { habitXp, dailyXp, questXp, sessionXp } from '../../game/rules'
import type { GameDatabase } from '../db'
import { buildCampaignView } from './campaigns'
import {
  type TaskRef,
  allTables,
  evidenceOf,
  isScheduledOn,
  pathOf,
  projectPlayer,
  questStepsDone,
  sessionsOf,
  skillMap,
} from './shared'

/** Todo lo que muestra la vista de detalle de una misión. `null` si ya no existe. */
export async function getTaskDetail(db: GameDatabase, ref: TaskRef, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const skills = await skillMap(db)
    const shared = {
      campaign: null as string | null,
      actLabel: null as string | null,
      lock: null as string | null,
      boss: false,
      skipped: false,
      canSkip: false,
      evidence: await evidenceOf(db, ref.id),
    }

    if (ref.kind === 'habit') {
      const task = await db.habits.get(ref.id)
      if (!task) return null
      const player = await projectPlayer(db, today)
      return {
        ...shared,
        kind: 'habit' as const,
        task,
        done: (await db.xpEvents.get({ taskId: ref.id, day: today })) !== undefined,
        state: (await db.habitLogs.get(`${ref.id}:${today}`))?.state ?? null,
        scheduledToday: isScheduledOn(task, today),
        xp: habitXp(task.difficulty, player.streak),
        completions: await db.habitLogs
          .where('habitId')
          .equals(ref.id)
          .filter((log) => log.state === 'done' || log.state === 'half')
          .count(),
        stepsDone: task.stepsDone?.day === today ? task.stepsDone.done : [],
        skill: pathOf(skills, task.skillId),
      }
    }

    if (ref.kind === 'daily') {
      const task = await db.dailies.get(ref.id)
      if (!task) return null
      const campaign = task.campaignId ? ((await db.campaigns.get(task.campaignId))?.title ?? null) : null
      return {
        ...shared,
        kind: 'daily' as const,
        task,
        campaign,
        // Una misión del día caducada ya no se puede completar.
        lock: task.completedDay === null && task.day !== today ? 'Esta misión del día ya caducó' : null,
        done: task.completedDay !== null,
        xp: dailyXp(task.difficulty, (await projectPlayer(db, today)).streak),
        completions: task.completedDay ? 1 : 0,
        stepsDone: task.stepsDone ?? [],
        skill: pathOf(skills, task.skillId),
      }
    }

    const task = await db.sideQuests.get(ref.id)
    if (!task) return null
    const campaign = task.campaignId ? await db.campaigns.get(task.campaignId) : undefined
    const view = campaign
      ? buildCampaignView(campaign, await db.sideQuests.where('campaignId').equals(campaign.id).toArray())
      : null
    const act = view?.actViews.find((candidate) => candidate.quests.some((quest) => quest.id === task.id))
    const lock = act?.quests.find((quest) => quest.id === task.id)?.lock ?? null
    const skipped = (task.skippedDay ?? null) !== null
    return {
      ...shared,
      kind: 'sideQuest' as const,
      task,
      campaign: campaign?.title ?? null,
      actLabel: view && !view.legacy && act ? `Fase ${act.number}` : null,
      lock,
      boss: task.boss === true,
      skipped,
      canSkip: !task.boss && lock === null && task.completedDay === null && !skipped,
      done: task.completedDay !== null,
      xp: questXp(task),
      completions: task.completedDay ? 1 : 0,
      stepsDone: questStepsDone(task, today),
      // Misión de práctica: cuántas sesiones van y si la de hoy ya está hecha.
      sessions:
        sessionsOf(task) > 1
          ? {
              total: sessionsOf(task),
              done: task.sessionDays?.length ?? 0,
              today: (task.sessionDays ?? []).includes(today),
              xp: sessionXp(task),
            }
          : null,
      skill: pathOf(skills, task.skillId),
    }
  })
}

export type TaskDetailView = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>
