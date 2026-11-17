import { z } from 'zod'
import { SOUNDS, THEMES, TITLES, type SoundId, type ThemeId, type TitleId } from '../game/cosmetics'
import {
  migrateAdjustment,
  type CosmeticSettings,
  type GameDatabase,
  type NotificationSettings,
  type PrefsSettings,
  type ProfileSettings,
} from './db'
import { markBackupDone } from './settings'

const BACKUP_APP = 'real-life-rpg'
/**
 * Versión 8: ruta progresiva de hábitos, «N veces por semana» y recordatorio por hábito.
 * Versión 7: tres misiones del día, premios y canjes de la tienda.
 * Versión 6: registro de sueño.
 * Versión 5: notas diarias de la bitácora.
 * Versión 4: los contratos diarios pasan a ser hábitos, con registro por día.
 * Versión 3: revisiones semanales. Versión 2: actos, análisis, habilidades, bitácora y misión del día.
 * Las versiones 1 a 3 se siguen importando: sus contratos se convierten en hábitos diarios (`upgradeLegacy`).
 */
const BACKUP_VERSION = 8
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6, 7, BACKUP_VERSION] as const

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
  principle: text(8).optional(),
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

const plannedMission = z.object({
  title,
  difficulty,
  description: text(1000),
  steps: z.array(text(200)).max(10),
})

const review = z.object({
  id: day,
  createdAt: timestamp,
  empty: z.boolean().optional(),
  summary: text(1200),
  wins: z.array(text(400)).max(8),
  stuck: z.array(z.object({ title: text(200), cause: text(400) })).max(8),
  adjustments: z
    .array(
      z.object({
        id,
        kind: z.enum(['split', 'difficulty', 'archiveHabit', 'addHabit']),
        reason: text(400),
        principle: text(8).optional(),
        questId: id.optional(),
        habitId: id.optional(),
        targetTitle: text(200).optional(),
        difficulty: difficulty.optional(),
        parts: z.array(plannedMission).max(4).optional(),
        habit: plannedMission.omit({ description: true }).optional(),
        status: z.enum(['pending', 'applied', 'dismissed']),
      }),
    )
    .max(8),
  focus: z.array(z.object({ title: text(200), why: text(400), questId: id.optional() })).max(5),
  model: text(100).optional(),
})

// z.object descarta cualquier campo que no esté aquí, así un respaldo nunca mete datos extra.
const dataSchema = z.object({
  habits: z.array(
    z.object({
      id,
      title,
      difficulty,
      ...detail,
      emoji: text(16).optional(),
      frequency: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('daily') }),
        z.object({ kind: z.literal('weekdays'), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
        z.object({ kind: z.literal('timesPerWeek'), times: z.number().int().min(1).max(6) }),
      ]),
      order: z.number().int(),
      createdAt: timestamp,
      createdDay: day,
      archivedDay: day.nullable(),
      stepsDone: z.object({ day, done: stepIndexes }).optional(),
      campaignId: id.optional(),
      reminder: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      routeItemId: id.optional(),
      level: z.number().int().min(0).max(10).optional(),
      levelSince: day.optional(),
    }),
  ),
  habitLogs: z
    .array(z.object({ id: z.string().min(1).max(220), habitId: id, day, state: z.enum(['done', 'half', 'missed']) }))
    .default([]),
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
      kind: z.enum(['habit', 'sideQuest', 'daily']),
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
        taskKind: z.enum(['sideQuest', 'habit', 'daily']),
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
        id: z.string().min(1).max(20),
        day,
        slot: z.number().int().min(1).max(3),
        kind: z.enum(['campaign', 'habit', 'free']).optional(),
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
  // No existe en los respaldos de las versiones 1 a 7.
  routeItems: z
    .array(
      z.object({
        id,
        order: z.number().int(),
        title,
        emoji: text(16).optional(),
        why: text(400),
        levels: z.array(text(120)).min(1).max(6),
        principle: text(8).optional(),
        frequency: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('daily') }),
          z.object({ kind: z.literal('weekdays'), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
          z.object({ kind: z.literal('timesPerWeek'), times: z.number().int().min(1).max(6) }),
        ]),
        status: z.enum(['pending', 'active', 'mastered']),
        habitId: id.optional(),
        snoozedUntil: day.optional(),
        createdAt: timestamp,
      }),
    )
    .default([]),
  // No existen en los respaldos de las versiones 1 a 6.
  rewards: z
    .array(
      z.object({
        id,
        title,
        emoji: text(16).optional(),
        price: z.number().int().min(0).max(100_000),
        repeatable: z.boolean(),
        createdAt: timestamp,
        archived: z.boolean().optional(),
        goal: z
          .discriminatedUnion('kind', [
            z.object({ kind: z.literal('campaign'), targetId: id, label: text(200) }),
            z.object({ kind: z.literal('act'), targetId: id, label: text(200) }),
            z.object({ kind: z.literal('quest'), targetId: id, label: text(200) }),
            z.object({
              kind: z.literal('habitStreak'),
              targetId: id,
              days: z.number().int().min(1).max(365),
              label: text(200),
            }),
          ])
          .optional(),
        earnedDay: day.nullable().optional(),
      }),
    )
    .default([]),
  redemptions: z
    .array(
      z.object({
        id,
        rewardId: id,
        title,
        emoji: text(16).optional(),
        cost: z.number().int().min(0),
        day,
        createdAt: timestamp,
      }),
    )
    .default([]),
  // No existe en los respaldos de las versiones 1 a 5.
  sleep: z.array(z.object({ id: day, hours: z.number().min(0).max(14).multipleOf(0.5) })).default([]),
  // No existe en los respaldos de las versiones 1 a 4.
  dailyNotes: z
    .array(z.object({ id: day, text: text(2000), photo: photo.optional(), createdAt: timestamp, updatedAt: timestamp }))
    .default([]),
  // No existe en los respaldos de las versiones 1 y 2.
  reviews: z.array(review).max(600).default([]),
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
  version: z.literal(SUPPORTED_VERSIONS),
  exportedAt: z.iso.datetime(),
  data: dataSchema,
})

export type Backup = z.infer<typeof backupSchema>

export class BackupError extends Error {}

function tables(db: GameDatabase) {
  return [
    db.habits,
    db.campaigns,
    db.sideQuests,
    db.xpEvents,
    db.player,
    db.settings,
    db.skills,
    db.evidence,
    db.dailies,
    db.reviews,
    db.habitLogs,
    db.dailyNotes,
    db.sleep,
    db.rewards,
    db.redemptions,
    db.routeItems,
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
        habits: await db.habits.toArray(),
        habitLogs: await db.habitLogs.toArray(),
        dailyNotes: await db.dailyNotes.toArray(),
        sleep: await db.sleep.toArray(),
        rewards: await db.rewards.toArray(),
        redemptions: await db.redemptions.toArray(),
        routeItems: await db.routeItems.toArray(),
        campaigns: await db.campaigns.toArray(),
        sideQuests: await db.sideQuests.toArray(),
        xpEvents: await db.xpEvents.toArray(),
        player: await db.player.toArray(),
        skills: await db.skills.toArray(),
        evidence: await db.evidence.toArray(),
        dailies: await db.dailies.toArray(),
        reviews: await db.reviews.toArray(),
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

  const result = backupSchema.safeParse(upgradeDailies(upgradeLegacy(json)))
  if (result.success) {
    if (!isConsistent(result.data)) throw new BackupError('El respaldo está incompleto o dañado.')
    return result.data
  }

  const header = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (header.app !== BACKUP_APP) throw new BackupError('Este archivo no es un respaldo de Real Life RPG.')
  if (!SUPPORTED_VERSIONS.includes(header.version as never)) {
    throw new BackupError('Este respaldo es de una versión de la app que no se reconoce.')
  }
  throw new BackupError('El respaldo está incompleto o dañado.')
}

/**
 * Los respaldos de las versiones 1 a 3 guardaban «contratos diarios» (`bounties`). Se convierten en hábitos
 * diarios, cada día cumplido queda como «hecho» y su XP se conserva, igual que la migración de la base de datos.
 */
/** Antes de la versión 7 había una sola misión del día, cuyo id era el día: pasa a ser la número 1 de ese día. */
function upgradeDailies(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const backup = json as { version?: unknown; data?: Record<string, unknown> }
  if (
    typeof backup.version !== 'number' ||
    backup.version >= 7 ||
    !backup.data ||
    !Array.isArray(backup.data.dailies)
  ) {
    return json
  }
  const dailies = (backup.data.dailies as Array<Record<string, unknown>>).map((daily) => ({
    ...daily,
    day: typeof daily.id === 'string' ? daily.id.slice(0, 10) : daily.id,
    slot: 1,
  }))
  return { ...backup, data: { ...backup.data, dailies } }
}

function upgradeLegacy(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const backup = json as { version?: unknown; data?: Record<string, unknown> }
  if (typeof backup.version !== 'number' || backup.version >= 4 || typeof backup.data !== 'object' || !backup.data) {
    return json
  }
  const { bounties, ...data } = backup.data as Record<string, unknown> & { bounties?: unknown }
  const list = Array.isArray(bounties) ? [...(bounties as Array<{ createdAt: number }>)] : []
  list.sort((a, b) => a.createdAt - b.createdAt)
  const events = Array.isArray(data.xpEvents) ? (data.xpEvents as Array<Record<string, unknown>>) : []
  const evidence = Array.isArray(data.evidence) ? (data.evidence as Array<Record<string, unknown>>) : []
  const reviews = Array.isArray(data.reviews) ? (data.reviews as Array<{ adjustments?: unknown }>) : []
  return {
    ...backup,
    data: {
      ...data,
      habits: Array.isArray(bounties)
        ? list.map((bounty, order) => ({ ...bounty, frequency: { kind: 'daily' }, order }))
        : data.habits,
      habitLogs: Array.isArray(bounties)
        ? events
            .filter((event) => event.kind === 'bounty')
            .map((event) => ({
              id: `${event.taskId}:${event.day}`,
              habitId: event.taskId,
              day: event.day,
              state: 'done',
            }))
        : data.habitLogs,
      xpEvents: events.map((event) => (event.kind === 'bounty' ? { ...event, kind: 'habit' } : event)),
      evidence: evidence.map((item) => (item.taskKind === 'bounty' ? { ...item, taskKind: 'habit' } : item)),
      reviews: reviews.map((review) => ({
        ...review,
        adjustments: Array.isArray(review.adjustments)
          ? (review.adjustments as Array<Record<string, unknown>>).map(migrateAdjustment)
          : review.adjustments,
      })),
    },
  }
}

export function summarizeBackup(backup: Backup) {
  const { data } = backup
  return {
    exportedAt: backup.exportedAt,
    habits: data.habits.filter((habit) => habit.archivedDay === null).length,
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
      await db.habits.bulkAdd(backup.data.habits)
      await db.habitLogs.bulkAdd(backup.data.habitLogs)
      await db.dailyNotes.bulkAdd(backup.data.dailyNotes)
      await db.sleep.bulkAdd(backup.data.sleep)
      await db.rewards.bulkAdd(backup.data.rewards)
      await db.redemptions.bulkAdd(backup.data.redemptions)
      await db.routeItems.bulkAdd(backup.data.routeItems)
      await db.campaigns.bulkAdd(backup.data.campaigns)
      await db.sideQuests.bulkAdd(backup.data.sideQuests)
      await db.xpEvents.bulkAdd(backup.data.xpEvents)
      await db.player.bulkAdd(backup.data.player)
      await db.skills.bulkAdd(backup.data.skills)
      await db.evidence.bulkAdd(backup.data.evidence)
      await db.dailies.bulkAdd(backup.data.dailies)
      await db.reviews.bulkAdd(backup.data.reviews)
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
