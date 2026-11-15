// Notas diarias de la bitácora: algo épico que hiciste o algo por lo que das gracias, una por día, con foto opcional.
import { gameDayOf, type GameDay } from '../../game/gameDay'
import type { DailyNote, GameDatabase } from '../db'

export const MAX_DAILY_NOTE_LENGTH = 2000

export async function getDailyNote(db: GameDatabase, day: GameDay): Promise<DailyNote | null> {
  return (await db.dailyNotes.get(day)) ?? null
}

/**
 * Guarda la nota de un día (no del futuro). `photo: null` quita la foto; si se omite, se conserva la que había.
 * Sin texto ni foto, la nota se borra.
 */
export async function saveDailyNote(
  db: GameDatabase,
  day: GameDay,
  entry: { text: string; photo?: string | null },
  now = new Date(),
): Promise<boolean> {
  if (day > gameDayOf(now)) return false
  const existing = await db.dailyNotes.get(day)
  const text = entry.text.trim().slice(0, MAX_DAILY_NOTE_LENGTH)
  const photo = entry.photo === undefined ? existing?.photo : (entry.photo ?? undefined)
  if (!text && !photo) {
    await db.dailyNotes.delete(day)
    return true
  }
  await db.dailyNotes.put({
    id: day,
    text,
    ...(photo ? { photo } : {}),
    createdAt: existing?.createdAt ?? now.getTime(),
    updatedAt: now.getTime(),
  })
  return true
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
