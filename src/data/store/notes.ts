// Notas diarias de la bitácora: algo épico que hiciste o algo por lo que das gracias, una por día, con varias fotos y videos opcionales.
import { gameDayOf, type GameDay } from '../../game/gameDay'
import type { DailyNote, GameDatabase } from '../db'
import { storeVideo, type NewMedia } from './media'
import { MAX_DIARY_PHOTOS, MAX_VIDEOS } from './shared'

export const MAX_DAILY_NOTE_LENGTH = 2000

export async function getDailyNote(db: GameDatabase, day: GameDay): Promise<DailyNote | null> {
  return (await db.dailyNotes.get(day)) ?? null
}

/** Foto que representa el día (calendario, recuerdo): la primera foto o, si no hay, la miniatura del primer video. */
export function noteCover(note: DailyNote | null | undefined): string | undefined {
  return note?.photos?.[0] ?? note?.videos?.find((video) => video.poster)?.poster
}

const hasMedia = (note: Pick<DailyNote, 'photos' | 'videos'>) =>
  (note.photos?.length ?? 0) > 0 || (note.videos?.length ?? 0) > 0

/** Escribe la nota sin borrar si no queda nada (sin texto, fotos ni videos, la nota desaparece). */
async function putNote(
  db: GameDatabase,
  day: GameDay,
  fields: Omit<DailyNote, 'id' | 'createdAt' | 'updatedAt'>,
  now: Date,
) {
  const existing = await db.dailyNotes.get(day)
  if (!fields.text && !hasMedia(fields)) {
    await db.dailyNotes.delete(day)
    return
  }
  await db.dailyNotes.put({
    id: day,
    text: fields.text,
    ...(fields.photos?.length ? { photos: fields.photos } : {}),
    ...(fields.videos?.length ? { videos: fields.videos } : {}),
    createdAt: existing?.createdAt ?? now.getTime(),
    updatedAt: now.getTime(),
  })
}

/** Guarda el texto de un día (no del futuro); las fotos y los videos se conservan. Sin nada, la nota se borra. */
export async function saveDailyNote(
  db: GameDatabase,
  day: GameDay,
  entry: { text: string },
  now = new Date(),
): Promise<boolean> {
  if (day > gameDayOf(now)) return false
  await db.transaction('rw', db.dailyNotes, async () => {
    const existing = await db.dailyNotes.get(day)
    const text = entry.text.trim().slice(0, MAX_DAILY_NOTE_LENGTH)
    await putNote(db, day, { text, photos: existing?.photos, videos: existing?.videos }, now)
  })
  return true
}

/**
 * Agrega fotos y videos a un día, hasta los límites. Devuelve cuántos entraron y cuántos no cupieron.
 * `text` es el texto que se está escribiendo (si la nota todavía no existe, se guarda con él).
 */
export async function addDiaryMedia(
  db: GameDatabase,
  day: GameDay,
  items: NewMedia[],
  text: string | undefined,
  now = new Date(),
): Promise<{ added: number; skipped: number }> {
  if (day > gameDayOf(now)) return { added: 0, skipped: items.length }
  return db.transaction('rw', db.dailyNotes, db.media, async () => {
    const existing = await db.dailyNotes.get(day)
    const photos = [...(existing?.photos ?? [])]
    const videos = [...(existing?.videos ?? [])]
    let added = 0
    for (const item of items) {
      if ('photo' in item && photos.length < MAX_DIARY_PHOTOS) photos.push(item.photo)
      else if ('video' in item && videos.length < MAX_VIDEOS) videos.push(await storeVideo(db, item.video, now))
      else continue
      added += 1
    }
    const noteText = (text ?? existing?.text ?? '').trim().slice(0, MAX_DAILY_NOTE_LENGTH)
    if (added > 0) await putNote(db, day, { text: noteText, photos, videos }, now)
    return { added, skipped: items.length - added }
  })
}

export async function removeDiaryPhoto(db: GameDatabase, day: GameDay, index: number, now = new Date()): Promise<void> {
  await db.transaction('rw', db.dailyNotes, async () => {
    const existing = await db.dailyNotes.get(day)
    if (!existing?.photos?.[index]) return
    const photos = existing.photos.filter((_, position) => position !== index)
    await putNote(db, day, { text: existing.text, photos, videos: existing.videos }, now)
  })
}

export async function removeDiaryVideo(db: GameDatabase, day: GameDay, videoId: string, now = new Date()) {
  await db.transaction('rw', db.dailyNotes, db.media, async () => {
    const existing = await db.dailyNotes.get(day)
    if (!existing) return
    await db.media.delete(videoId)
    const videos = (existing.videos ?? []).filter((video) => video.id !== videoId)
    await putNote(db, day, { text: existing.text, photos: existing.photos, videos }, now)
  })
}

/** Todas las notas, de la más reciente a la más antigua. */
export async function listDailyNotes(db: GameDatabase): Promise<DailyNote[]> {
  return (await db.dailyNotes.toArray()).sort((a, b) => b.id.localeCompare(a.id))
}

/** Notas de un mes (`YYYY-MM`), por día. */
export async function getDiaryMonth(db: GameDatabase, month: string): Promise<Map<GameDay, DailyNote>> {
  const notes = await db.dailyNotes.where('id').between(`${month}-01`, `${month}-32`).toArray()
  return new Map(notes.map((note) => [note.id, note]))
}

/** Notas entre dos días (inclusive), por día. */
export async function getDiaryRange(db: GameDatabase, first: GameDay, last: GameDay): Promise<Map<GameDay, DailyNote>> {
  const notes = await db.dailyNotes.where('id').between(first, last, true, true).toArray()
  return new Map(notes.map((note) => [note.id, note]))
}

/** Mismo día de otro mes (`months` atrás); si ese mes es más corto, `null`. */
function sameDayMonthsAgo(day: GameDay, months: number): GameDay | null {
  const [year, month, date] = day.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 - months, date))
  return target.getUTCDate() === date ? target.toISOString().slice(0, 10) : null
}

/**
 * Recuerdo para Hoy: la nota del mismo día de hace un año o, si no hay, de hace un mes.
 * `null` si no hay ninguna.
 */
export async function getMemory(db: GameDatabase, today: GameDay) {
  for (const [months, label] of [
    [12, 'Hace un año'],
    [1, 'Hace un mes'],
  ] as const) {
    const day = sameDayMonthsAgo(today, months)
    const note = day ? await db.dailyNotes.get(day) : undefined
    if (note) return { label, note }
  }
  return null
}
