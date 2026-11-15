// Bitácora de evidencias: fotos y notas.
import { gameDayOf } from '../../game/gameDay'
import type { Evidence, GameDatabase } from '../db'
import { MAX_NOTES_PER_TASK, MAX_NOTE_LENGTH, MAX_PHOTOS_PER_TASK, type TaskRef, allTables } from './shared'

async function taskTitle(db: GameDatabase, ref: TaskRef): Promise<string | null> {
  const task =
    ref.kind === 'bounty'
      ? await db.bounties.get(ref.id)
      : ref.kind === 'daily'
        ? await db.dailies.get(ref.id)
        : await db.sideQuests.get(ref.id)
  return task?.title ?? null
}

/** Agrega una foto (data URL ya comprimida) o una nota. Devuelve `null` si se alcanzó el límite. */
export async function addEvidence(
  db: GameDatabase,
  ref: TaskRef,
  content: { photo: string } | { note: string },
  now = new Date(),
): Promise<Evidence | null> {
  return db.transaction('rw', allTables(db), async () => {
    const title = await taskTitle(db, ref)
    if (title === null) return null
    const existing = await db.evidence.where('taskId').equals(ref.id).toArray()

    const isPhoto = 'photo' in content
    const note = isPhoto ? '' : content.note.trim().slice(0, MAX_NOTE_LENGTH)
    if (isPhoto && existing.filter((item) => item.photo).length >= MAX_PHOTOS_PER_TASK) return null
    if (!isPhoto && (!note || existing.filter((item) => item.note).length >= MAX_NOTES_PER_TASK)) return null

    const evidence: Evidence = {
      id: crypto.randomUUID(),
      taskKind: ref.kind,
      taskId: ref.id,
      taskTitle: title,
      createdAt: now.getTime(),
      day: gameDayOf(now),
      ...(isPhoto ? { photo: content.photo } : { note }),
    }
    await db.evidence.add(evidence)
    return evidence
  })
}

export async function deleteEvidence(db: GameDatabase, id: string): Promise<void> {
  await db.evidence.delete(id)
}

/** Todas las evidencias, de la más reciente a la más antigua, con su campaña si la tienen. */
export async function getJournal(db: GameDatabase) {
  return db.transaction('r', db.evidence, db.sideQuests, db.campaigns, async () => {
    const entries = (await db.evidence.toArray()).sort((a, b) => b.createdAt - a.createdAt)
    const campaigns = new Map((await db.campaigns.toArray()).map((campaign) => [campaign.id, campaign.title]))
    const quests = new Map((await db.sideQuests.toArray()).map((quest) => [quest.id, quest]))

    return entries.map((entry) => {
      const quest = quests.get(entry.taskId)
      return {
        ...entry,
        boss: quest?.boss === true,
        campaign: quest?.campaignId ? (campaigns.get(quest.campaignId) ?? null) : null,
      }
    })
  })
}

export type JournalEntry = Awaited<ReturnType<typeof getJournal>>[number]
