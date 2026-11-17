// Bitácora de evidencias: fotos y notas.
import { gameDayOf } from '../../game/gameDay'
import type { Evidence, GameDatabase } from '../db'
import { storeVideo, type NewVideo } from './media'
import { MAX_NOTES_PER_TASK, MAX_NOTE_LENGTH, MAX_PHOTOS_PER_TASK, MAX_VIDEOS, type TaskRef, allTables } from './shared'

async function taskTitle(db: GameDatabase, ref: TaskRef): Promise<string | null> {
  const task =
    ref.kind === 'habit'
      ? await db.habits.get(ref.id)
      : ref.kind === 'daily'
        ? await db.dailies.get(ref.id)
        : await db.sideQuests.get(ref.id)
  return task?.title ?? null
}

/** Agrega una foto (data URL ya comprimida), un video o una nota. Devuelve `null` si se alcanzó el límite. */
export async function addEvidence(
  db: GameDatabase,
  ref: TaskRef,
  content: { photo: string } | { note: string } | { video: NewVideo },
  now = new Date(),
): Promise<Evidence | null> {
  return db.transaction('rw', allTables(db), async () => {
    const title = await taskTitle(db, ref)
    if (title === null) return null
    const existing = await db.evidence.where('taskId').equals(ref.id).toArray()

    const base = {
      id: crypto.randomUUID(),
      taskKind: ref.kind,
      taskId: ref.id,
      taskTitle: title,
      createdAt: now.getTime(),
      day: gameDayOf(now),
    }
    let evidence: Evidence
    if ('photo' in content) {
      if (existing.filter((item) => item.photo).length >= MAX_PHOTOS_PER_TASK) return null
      evidence = { ...base, photo: content.photo }
    } else if ('video' in content) {
      if (existing.filter((item) => item.video).length >= MAX_VIDEOS) return null
      evidence = { ...base, video: await storeVideo(db, content.video, now) }
    } else {
      const note = content.note.trim().slice(0, MAX_NOTE_LENGTH)
      if (!note || existing.filter((item) => item.note).length >= MAX_NOTES_PER_TASK) return null
      evidence = { ...base, note }
    }

    await db.evidence.add(evidence)
    return evidence
  })
}

export async function deleteEvidence(db: GameDatabase, id: string): Promise<void> {
  await db.transaction('rw', db.evidence, db.media, async () => {
    const evidence = await db.evidence.get(id)
    if (evidence?.video) await db.media.delete(evidence.video.id)
    await db.evidence.delete(id)
  })
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
