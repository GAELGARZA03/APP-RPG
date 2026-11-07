import { z } from 'zod'
import { SOUNDS, THEMES, TITLES, type SoundId, type ThemeId, type TitleId } from '../game/cosmetics'
import type { CosmeticSettings, GameDatabase, NotificationSettings, ProfileSettings } from './db'
import { markBackupDone } from './settings'

const BACKUP_APP = 'real-life-rpg'
const BACKUP_VERSION = 1

const id = z.string().min(1).max(100)
const title = z.string().trim().min(1).max(200)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const difficulty = z.literal([1, 2, 3, 4, 5])
const timestamp = z.number().int().nonnegative()
const description = z.string().max(1000).optional()
const steps = z.array(z.string().max(200)).max(10).optional()

// z.object descarta cualquier campo que no esté aquí, así un respaldo nunca mete datos extra.
const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.iso.datetime(),
  data: z.object({
    bounties: z.array(
      z.object({
        id,
        title,
        difficulty,
        description,
        steps,
        createdAt: timestamp,
        createdDay: day,
        archivedDay: day.nullable(),
      }),
    ),
    campaigns: z.array(z.object({ id, title, createdAt: timestamp, createdDay: day })),
    sideQuests: z.array(
      z.object({
        id,
        title,
        difficulty,
        description,
        steps,
        campaignId: id.nullable(),
        createdAt: timestamp,
        createdDay: day,
        completedDay: day.nullable(),
      }),
    ),
    xpEvents: z.array(
      z.object({ id, kind: z.enum(['bounty', 'sideQuest']), taskId: id, day, xp: z.number().int().nonnegative() }),
    ),
    player: z
      .array(z.object({ id: z.literal('player'), streak: z.number().int().nonnegative(), lastSettledDay: day }))
      .max(1),
    settings: z
      .array(
        z.discriminatedUnion('id', [
          z.object({
            id: z.literal('notifications'),
            enabled: z.boolean(),
            morning: time,
            afternoon: time,
            night: time,
            weeklyBackupReminder: z.boolean(),
          }),
          z.object({
            id: z.literal('profile'),
            name: z.string().max(40),
            photo: z
              .string()
              .max(400_000)
              .regex(/^data:image\/(jpeg|png|webp);base64,/)
              .nullable(),
          }),
          z.object({
            id: z.literal('cosmetics'),
            theme: z.enum(THEMES.map((theme) => theme.id) as [ThemeId, ...ThemeId[]]),
            title: z.enum(TITLES.map((title) => title.id) as [TitleId, ...TitleId[]]),
            sound: z.enum(SOUNDS.map((sound) => sound.id) as [SoundId, ...SoundId[]]),
            crt: z.boolean(),
          }),
        ]),
      )
      .max(3),
  }),
})

export type Backup = z.infer<typeof backupSchema>

export class BackupError extends Error {}

function tables(db: GameDatabase) {
  return [db.bounties, db.campaigns, db.sideQuests, db.xpEvents, db.player, db.settings]
}

export async function createBackup(db: GameDatabase, now = new Date()): Promise<Backup> {
  return db.transaction('r', tables(db), async () => {
    const settings = await db.settings.toArray()

    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      data: {
        bounties: await db.bounties.toArray(),
        campaigns: await db.campaigns.toArray(),
        sideQuests: await db.sideQuests.toArray(),
        xpEvents: await db.xpEvents.toArray(),
        player: await db.player.toArray(),
        // La info del último respaldo y el modelo de IA no viajan; la API key ni siquiera está aquí.
        settings: settings.filter(
          (setting): setting is NotificationSettings | CosmeticSettings | ProfileSettings =>
            setting.id === 'notifications' || setting.id === 'cosmetics' || setting.id === 'profile',
        ),
      },
    }
  })
}

export function parseBackup(text: string): Backup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError('El archivo no es un respaldo válido.')
  }

  const result = backupSchema.safeParse(json)
  if (result.success) return result.data

  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (header.app !== BACKUP_APP) throw new BackupError('Este archivo no es un respaldo de Real Life RPG.')
  if (header.version !== BACKUP_VERSION) {
    throw new BackupError('Este respaldo es de una versión de la app que no se reconoce.')
  }
  throw new BackupError('El respaldo está incompleto o dañado.')
}

export function summarizeBackup(backup: Backup) {
  const { data } = backup
  return {
    exportedAt: backup.exportedAt,
    bounties: data.bounties.filter((bounty) => bounty.archivedDay === null).length,
    campaigns: data.campaigns.length,
    sideQuests: data.sideQuests.length,
    totalXp: data.xpEvents.reduce((sum, event) => sum + event.xp, 0),
  }
}

/** Reemplaza todos los datos. Si algo falla, no se cambia nada. */
export async function restoreBackup(db: GameDatabase, backup: Backup): Promise<void> {
  try {
    await db.transaction('rw', tables(db), async () => {
      await Promise.all(tables(db).map((table) => table.clear()))
      await db.bounties.bulkAdd(backup.data.bounties)
      await db.campaigns.bulkAdd(backup.data.campaigns)
      await db.sideQuests.bulkAdd(backup.data.sideQuests)
      await db.xpEvents.bulkAdd(backup.data.xpEvents)
      await db.player.bulkAdd(backup.data.player)
      await db.settings.bulkAdd(backup.data.settings)
      await markBackupDone(db, backup.exportedAt)
    })
  } catch {
    throw new BackupError('El respaldo está dañado: tus datos actuales no se modificaron.')
  }
}

export function backupFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `real-life-rpg-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
