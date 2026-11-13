import { z } from 'zod'
import { SOUNDS, THEMES, TITLES, type SoundId, type ThemeId, type TitleId } from '../game/cosmetics'
import type { CosmeticSettings, GameDatabase, NotificationSettings, PrefsSettings, ProfileSettings } from './db'
import { markBackupDone } from './settings'

const BACKUP_APP = 'real-life-rpg'
/** Versión 2: agrega actos, análisis, habilidades, bitácora y misión del día. La 1 se sigue importando. */
const BACKUP_VERSION = 2

const id = z.string().min(1).max(100)
const title = z.string().trim().min(1).max(200)
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const difficulty = z.literal([1, 2, 3, 4, 5])
const timestamp = z.number().int().nonnegative()
const text = (max: number) => z.string().max(max)
const stepIndexes = z.array(z.number().int().min(0).max(20)).max(20)
// Cada foto ya viene comprimida (lado mayor de 1280 px); el tope evita meter archivos enormes.
const photo = z
  .string()
  .max(1_500_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,/)

const detail = {
  description: text(1000).optional(),
  steps: z.array(text(200)).max(10).optional(),
  estimate: text(80).optional(),
  why: text(400).optional(),
  tip: text(400).optional(),
  skillId: id.optional(),
}

const act = z.object({
  id,
  title,
  goal: text(400),
  difficulty,
  status: z.enum(['planned', 'ready']),
  readyDay: day.optional(),
})

const analysis = z.object({
  diagnosis: text(1200),
  successCriteria: text(600),
  obstacles: z.array(z.object({ obstacle: text(300), solution: text(400) })).max(6),
  duration: text(120),
})

const brief = z.object({
  idea: text(8000),
  answers: z.array(z.object({ question: text(300), answer: text(300) })).max(8),
})

// z.object descarta cualquier campo que no esté aquí, así un respaldo nunca mete datos extra.
const dataSchema = z.object({
  bounties: z.array(
    z.object({
      id,
      title,
      difficulty,
      ...detail,
      createdAt: timestamp,
      createdDay: day,
      archivedDay: day.nullable(),
      stepsDone: z.object({ day, done: stepIndexes }).optional(),
      campaignId: id.optional(),
    }),
  ),
  campaigns: z.array(
    z.object({
      id,
      title,
      createdAt: timestamp,
      createdDay: day,
      acts: z.array(act).max(8).optional(),
      analysis: analysis.optional(),
      brief: brief.optional(),
      skillId: id.optional(),
    }),
  ),
  sideQuests: z.array(
    z.object({
      id,
      title,
      difficulty,
      ...detail,
      campaignId: id.nullable(),
      createdAt: timestamp,
      createdDay: day,
      completedDay: day.nullable(),
      actId: id.optional(),
      boss: z.boolean().optional(),
      skippedDay: day.nullable().optional(),
      stepsDone: stepIndexes.optional(),
      undoCount: z.number().int().nonnegative().optional(),
    }),
  ),
  xpEvents: z.array(
    z.object({
      id,
      kind: z.enum(['bounty', 'sideQuest', 'daily']),
      taskId: id,
      day,
      xp: z.number().int().nonnegative(),
      skillId: id.optional(),
    }),
  ),
  player: z
    .array(z.object({ id: z.literal('player'), streak: z.number().int().nonnegative(), lastSettledDay: day }))
    .max(1),
  // Las tres tablas nuevas no existen en los respaldos de la versión 1.
  skills: z
    .array(z.object({ id, name: title, parentId: id.nullable(), createdAt: timestamp, origin: text(200).optional() }))
    .default([]),
  evidence: z
    .array(
      z.object({
        id,
        taskKind: z.enum(['sideQuest', 'bounty', 'daily']),
        taskId: id,
        taskTitle: text(200),
        createdAt: timestamp,
        day,
        note: text(600).optional(),
        photo: photo.optional(),
      }),
    )
    .default([]),
  dailies: z
    .array(
      z.object({
        id: day,
        title,
        difficulty,
        ...detail,
        createdAt: timestamp,
        createdDay: day,
        completedDay: day.nullable(),
        stepsDone: stepIndexes.optional(),
        campaignId: id.optional(),
      }),
    )
    .default([]),
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
        z.object({ id: z.literal('prefs'), haptics: z.boolean() }),
      ]),
    )
    .max(4),
})

const backupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal([1, BACKUP_VERSION]),
  exportedAt: z.iso.datetime(),
  data: dataSchema,
})

export type Backup = z.infer<typeof backupSchema>

export class BackupError extends Error {}

function tables(db: GameDatabase) {
  return [
    db.bounties,
    db.campaigns,
    db.sideQuests,
    db.xpEvents,
    db.player,
    db.settings,
    db.skills,
    db.evidence,
    db.dailies,
  ]
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
        skills: await db.skills.toArray(),
        evidence: await db.evidence.toArray(),
        dailies: await db.dailies.toArray(),
        // La info del último respaldo y los modelos de IA no viajan; la API key ni siquiera está aquí.
        settings: settings.filter(
          (setting): setting is NotificationSettings | CosmeticSettings | ProfileSettings | PrefsSettings =>
            setting.id === 'notifications' ||
            setting.id === 'cosmetics' ||
            setting.id === 'profile' ||
            setting.id === 'prefs',
        ),
      },
    }
  })
}

/** Un respaldo solo es válido si sus referencias internas apuntan a algo que existe. */
function isConsistent({ data }: Backup): boolean {
  const campaignIds = new Set(data.campaigns.map((campaign) => campaign.id))
  const skillIds = new Set(data.skills.map((skill) => skill.id))
  const actIds = new Set(data.campaigns.flatMap((campaign) => (campaign.acts ?? []).map((item) => item.id)))
  return (
    data.sideQuests.every((quest) => quest.campaignId === null || campaignIds.has(quest.campaignId)) &&
    data.sideQuests.every((quest) => quest.actId === undefined || actIds.has(quest.actId)) &&
    data.skills.every((skill) => skill.parentId === null || skillIds.has(skill.parentId))
  )
}

export function parseBackup(text: string): Backup {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new BackupError('El archivo no es un respaldo válido.')
  }

  const result = backupSchema.safeParse(json)
  if (result.success) {
    if (!isConsistent(result.data)) throw new BackupError('El respaldo está incompleto o dañado.')
    return result.data
  }

  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (header.app !== BACKUP_APP) throw new BackupError('Este archivo no es un respaldo de Real Life RPG.')
  if (header.version !== 1 && header.version !== BACKUP_VERSION) {
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
    skills: data.skills.length,
    evidence: data.evidence.length,
    totalXp: data.xpEvents.reduce((sum, event) => sum + event.xp, 0),
  }
}

/** Reemplaza todos los datos. Si algo falla, no se cambia nada. */
export async function restoreBackup(db: GameDatabase, backup: Backup): Promise<void> {
  try {
    await db.transaction('rw', tables(db), async () => {
      // Los modelos de IA no viajan en el respaldo: se conservan los de este teléfono.
      const ai = await db.settings.get('ai')
      await Promise.all(tables(db).map((table) => table.clear()))
      await db.bounties.bulkAdd(backup.data.bounties)
      await db.campaigns.bulkAdd(backup.data.campaigns)
      await db.sideQuests.bulkAdd(backup.data.sideQuests)
      await db.xpEvents.bulkAdd(backup.data.xpEvents)
      await db.player.bulkAdd(backup.data.player)
      await db.skills.bulkAdd(backup.data.skills)
      await db.evidence.bulkAdd(backup.data.evidence)
      await db.dailies.bulkAdd(backup.data.dailies)
      await db.settings.bulkAdd(backup.data.settings)
      if (ai) await db.settings.put(ai)
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
