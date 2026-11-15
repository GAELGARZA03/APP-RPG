// Misiones (side quests): crear, completar respetando el bloqueo de actos, saltar y deshacer.
import { gameDayOf } from '../../game/gameDay'
import { campaignState, isResolved, questXp } from '../../game/rules'
import type { GameDatabase, SideQuest } from '../db'
import {
  type ActCompletion,
  FAILED,
  type Outcome,
  type TaskChanges,
  type TaskInput,
  allSteps,
  allTables,
} from './shared'
import { pruneSkills } from './skills'

export async function addQuest(db: GameDatabase, fields: Omit<SideQuest, 'id' | 'completedDay'>): Promise<SideQuest> {
  const sideQuest: SideQuest = { id: crypto.randomUUID(), completedDay: null, ...fields }
  await db.sideQuests.add(sideQuest)
  return sideQuest
}

export async function createSideQuest(
  db: GameDatabase,
  input: TaskInput & { campaignId?: string | null },
  now = new Date(),
): Promise<SideQuest> {
  return db.transaction('rw', db.campaigns, db.sideQuests, async () => {
    const campaignId = input.campaignId ?? null
    let actId: string | undefined

    // En una campaña con actos, la misión manual entra al acto en curso (o al último si ya terminó).
    const campaign = campaignId ? await db.campaigns.get(campaignId) : undefined
    if (campaign?.acts?.length) {
      const quests = await db.sideQuests.where('campaignId').equals(campaign.id).toArray()
      const index = campaignState(campaign.acts, quests).currentIndex ?? campaign.acts.length - 1
      actId = campaign.acts[index].id
      // Agregar a mano una misión a un acto sin generar lo deja listo: sirve cuando no hay IA.
      if (campaign.acts[index].status === 'planned') {
        await db.campaigns.update(campaign.id, {
          acts: campaign.acts.map((act, position) =>
            position === index ? { ...act, status: 'ready' as const, readyDay: gameDayOf(now) } : act,
          ),
        })
      }
    }

    return addQuest(db, {
      title: input.title,
      difficulty: input.difficulty,
      description: input.description,
      steps: input.steps,
      ...(input.estimate ? { estimate: input.estimate } : {}),
      ...(input.why ? { why: input.why } : {}),
      ...(input.tip ? { tip: input.tip } : {}),
      ...(input.skillId ? { skillId: input.skillId } : {}),
      ...(actId ? { actId } : {}),
      campaignId,
      createdAt: now.getTime(),
      createdDay: gameDayOf(now),
    })
  })
}

export async function updateSideQuest(db: GameDatabase, id: string, changes: TaskChanges): Promise<void> {
  await db.transaction('rw', db.sideQuests, async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest) return
    // Si cambian los objetivos, las casillas se ajustan: todas si ya estaba completada, ninguna si no.
    const stepsChanged = changes.steps && JSON.stringify(changes.steps) !== JSON.stringify(quest.steps ?? [])
    await db.sideQuests.update(
      id,
      stepsChanged ? { ...changes, stepsDone: quest.completedDay ? allSteps(changes.steps!.length) : [] } : changes,
    )
  })
}

/** Borra la Side Quest y sus evidencias. El XP ya ganado se conserva; para quitarlo, primero se deshace. */
export async function deleteSideQuest(db: GameDatabase, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    await db.evidence.where('taskId').equals(id).delete()
    await db.sideQuests.delete(id)
    await pruneSkills(db)
  })
}

/** Estado de la campaña de una misión, para saber si está bloqueada o si cierra un acto. */
export async function campaignContext(db: GameDatabase, quest: SideQuest) {
  if (!quest.campaignId) return null
  const campaign = await db.campaigns.get(quest.campaignId)
  if (!campaign) return null
  const quests = await db.sideQuests.where('campaignId').equals(campaign.id).toArray()
  return { campaign, state: campaignState(campaign.acts, quests) }
}

/** Si entre `before` y ahora se cerró el acto de la misión, describe qué sigue. */
async function actCompletion(
  db: GameDatabase,
  quest: SideQuest,
  before: NonNullable<Awaited<ReturnType<typeof campaignContext>>>,
): Promise<ActCompletion | undefined> {
  const acts = before.campaign.acts
  if (!acts?.length) return undefined
  const after = await campaignContext(db, quest)
  if (!after) return undefined
  const index = Math.max(
    0,
    acts.findIndex((act) => act.id === quest.actId),
  )
  if (before.state.states[index] === 'done' || after.state.states[index] !== 'done') return undefined

  const next = acts[index + 1]
  return {
    campaignId: before.campaign.id,
    campaignTitle: before.campaign.title,
    actNumber: index + 1,
    actTitle: acts[index].title,
    next: next ? { number: index + 2, title: next.title, planned: next.status === 'planned' } : null,
  }
}

/** Completa una Side Quest respetando el bloqueo de actos y la evidencia de la misión jefe. */
export async function completeQuest(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest || quest.completedDay !== null) return FAILED

    const before = await campaignContext(db, quest)
    if (before?.state.locks.get(id)) return { ...FAILED, blocked: 'locked' as const }
    if (quest.boss && (await db.evidence.where('taskId').equals(id).count()) === 0) {
      return { ...FAILED, blocked: 'evidence' as const, boss: true }
    }

    const xp = questXp(quest)
    await db.sideQuests.update(id, {
      completedDay: today,
      skippedDay: null,
      stepsDone: allSteps(quest.steps?.length ?? 0),
    })
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'sideQuest',
      taskId: id,
      day: today,
      xp,
      ...(quest.skillId ? { skillId: quest.skillId } : {}),
    })

    return { ok: true, xp, boss: quest.boss === true, act: before ? await actCompletion(db, quest, before) : undefined }
  })
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeSideQuest(db: GameDatabase, id: string, now = new Date()): Promise<number | null> {
  const outcome = await completeQuest(db, id, now)
  return outcome.ok ? outcome.xp : null
}

/** "Ya sé hacer esto": la misión cuenta para avanzar, pero no da XP ni crea evento. */
export async function skipSideQuest(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  return db.transaction('rw', allTables(db), async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest || quest.boss || isResolved(quest)) return FAILED

    const before = await campaignContext(db, quest)
    if (before?.state.locks.get(id)) return { ...FAILED, blocked: 'locked' as const }

    await db.sideQuests.update(id, { skippedDay: gameDayOf(now) })
    return { ok: true, xp: 0, act: before ? await actCompletion(db, quest, before) : undefined }
  })
}

/**
 * Deshace una misión completada o saltada. Quita su XP (si lo dio) y, como el bloqueo se
 * deriva de las misiones, lo que dependía de ella vuelve a quedar bloqueado.
 */
export async function undoSideQuest(db: GameDatabase, id: string): Promise<boolean> {
  return db.transaction('rw', db.sideQuests, db.xpEvents, async () => {
    const sideQuest = await db.sideQuests.get(id)
    if (!sideQuest || !isResolved(sideQuest)) return false

    const wasCompleted = sideQuest.completedDay !== null
    await db.sideQuests.update(id, {
      completedDay: null,
      skippedDay: null,
      stepsDone: [],
      ...(wasCompleted ? { undoCount: (sideQuest.undoCount ?? 0) + 1 } : {}),
    })
    await db.xpEvents.where('taskId').equals(id).delete()
    return true
  })
}
