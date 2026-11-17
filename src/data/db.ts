import Dexie, { type EntityTable } from 'dexie'
import type { CosmeticChoice } from '../game/cosmetics'
import type { GameDay } from '../game/gameDay'
import type { Difficulty } from '../game/rules'

/** Detalle opcional de una misión. Las misiones antiguas no lo tienen. */
export interface TaskDetail {
  /** Qué hay que hacer y cómo saber que terminaste. */
  description?: string
  /** Objetivos concretos y medibles, como en un videojuego. */
  steps?: string[]
  /** Tiempo estimado, en texto libre ("30 min", "3 sesiones de 20 min"). */
  estimate?: string
  /** Por qué importa para la meta. */
  why?: string
  /** Consejo práctico. */
  tip?: string
  /** Habilidad del árbol que crece al completarla. */
  skillId?: string
  /** Principio de la biblioteca en el que se basó la IA (H4, A1…). */
  principle?: string
}

/**
 * Qué días toca un hábito. En `weekdays`, 0 es lunes y 6 es domingo. En `timesPerWeek`, cualquier día
 * sirve y la meta es hacerlo `times` veces de lunes a domingo.
 */
export type HabitFrequency =
  { kind: 'daily' } | { kind: 'weekdays'; days: number[] } | { kind: 'timesPerWeek'; times: number }

export interface Habit extends TaskDetail {
  id: string
  title: string
  /** Emoji opcional que se muestra en la libreta. */
  emoji?: string
  difficulty: Difficulty
  frequency: HabitFrequency
  /** Posición en la libreta (menor, más a la izquierda). */
  order: number
  createdAt: number
  createdDay: GameDay
  archivedDay: GameDay | null
  /** Objetivos marcados; solo valen para ese día de juego. */
  stepsDone?: { day: GameDay; done: number[] }
  /** Campaña con la que se creó; al borrarla, el hábito se archiva con ella. */
  campaignId?: string
  /** Hora del recordatorio (HH:MM), si tiene. */
  reminder?: string
  /** Paso de la ruta progresiva del que salió, con su nivel actual (0 = versión mínima). */
  routeItemId?: string
  level?: number
  /** Desde cuándo está en este nivel: la constancia se mide desde aquí. */
  levelSince?: GameDay
}

/** Un hábito de la ruta progresiva: se activa poco a poco y crece por niveles. */
export interface RouteItem {
  id: string
  order: number
  title: string
  emoji?: string
  why: string
  /** Del nivel mínimo al más alto; el texto de cada nivel es el nombre del hábito en ese nivel. */
  levels: string[]
  frequency: HabitFrequency
  /** Principio de la biblioteca en el que se basó la IA (H4, A1…). */
  principle?: string
  status: 'pending' | 'active' | 'mastered'
  habitId?: string
  /** Las sugerencias de este paso no se muestran hasta este día (el jugador dijo «Ahora no»). */
  snoozedUntil?: GameDay
  createdAt: number
}

export type HabitState = 'done' | 'half' | 'missed'

/** Lo que el jugador anotó de un hábito un día. Sin registro, ese día está «sin registrar». */
export interface HabitLog {
  /** `${habitId}:${day}`, así nunca hay dos registros del mismo día. */
  id: string
  habitId: string
  day: GameDay
  state: HabitState
}

export interface Act {
  id: string
  title: string
  goal: string
  difficulty: Difficulty
  /** `planned`: sus misiones aún no se generan. */
  status: 'planned' | 'ready'
  /** Día en que se crearon sus misiones; sirve para saber cuánto tardó el jugador. */
  readyDay?: GameDay
}

export interface CampaignAnalysis {
  diagnosis: string
  successCriteria: string
  obstacles: Array<{ obstacle: string; solution: string }>
  duration: string
}

export interface Campaign {
  id: string
  title: string
  createdAt: number
  createdDay: GameDay
  /** Las campañas anteriores a los actos no tienen nada de esto: todo cuenta como Acto 1. */
  acts?: Act[]
  analysis?: CampaignAnalysis
  /** Lo que el jugador pidió y respondió; se reutiliza al generar cada acto. */
  brief?: { idea: string; answers: Array<{ question: string; answer: string }> }
  /** Rama del árbol de habilidades de esta campaña. */
  skillId?: string
}

export interface SideQuest extends TaskDetail {
  id: string
  title: string
  difficulty: Difficulty
  campaignId: string | null
  createdAt: number
  createdDay: GameDay
  completedDay: GameDay | null
  actId?: string
  boss?: boolean
  /** "Ya sé hacer esto": cuenta para avanzar, pero no da XP. */
  skippedDay?: GameDay | null
  /** Índices de los objetivos marcados. */
  stepsDone?: number[]
  /** Veces que se deshizo; la IA lo usa para ajustar el siguiente acto. */
  undoCount?: number
}

/** Reto pequeño generado una vez por día de juego. Su `id` es el día, así nunca hay dos. */
/** Una de las tres misiones del día. `id` es `día#número` (las de antes de la v9 usaban solo el día). */
export interface Daily extends TaskDetail {
  id: string
  /** Día de juego al que pertenece; caduca a las 4:00 a. m. del día siguiente. */
  day: GameDay
  /** Posición (1 a 3). */
  slot: number
  /** De dónde sale: del acto de una campaña, de un hábito o habilidad, o un reto libre. */
  kind?: 'campaign' | 'habit' | 'free'
  title: string
  difficulty: Difficulty
  createdAt: number
  createdDay: GameDay
  completedDay: GameDay | null
  stepsDone?: number[]
  campaignId?: string
}

export interface Skill {
  id: string
  name: string
  /** `null` en las áreas, que cuelgan directamente del jugador. */
  parentId: string | null
  createdAt: number
  /** Campaña que la creó (se guarda el nombre para que sobreviva si se borra). */
  origin?: string
}

/** Una foto o una nota de la bitácora. */
export interface Evidence {
  id: string
  taskKind: 'sideQuest' | 'habit' | 'daily'
  taskId: string
  taskTitle: string
  createdAt: number
  day: GameDay
  note?: string
  /** Data URL JPEG ya comprimida. */
  photo?: string
}

/** Registro de cada recompensa. El XP total siempre es la suma de estos eventos. */
export interface XpEvent {
  id: string
  kind: 'habit' | 'sideQuest' | 'daily'
  taskId: string
  day: GameDay
  xp: number
  skillId?: string
}

/** Nota diaria de la bitácora: algo épico o algo por lo que das gracias. Una por día; su `id` es el día. */
export interface DailyNote {
  id: GameDay
  text: string
  /** Data URL JPEG ya comprimida, como las fotos de la bitácora de misiones. */
  photo?: string
  createdAt: number
  updatedAt: number
}

/** Horas dormidas la noche anterior a `id` (el día de juego en que despertaste). No da XP: es solo registro. */
export interface SleepLog {
  id: GameDay
  hours: number
}

/** Premio real que el jugador se da: se canjea con oro o se gana al cumplir una meta. */
export interface Reward {
  id: string
  title: string
  emoji?: string
  /** Precio en oro; 0 en los premios por meta. */
  price: number
  /** Se puede canjear varias veces (los premios por meta, una sola). */
  repeatable: boolean
  createdAt: number
  /** Ya no se ofrece en la tienda (su historial de canjes se conserva). */
  archived?: boolean
  /** Premio por meta: se gana al cumplirla y se canjea gratis. */
  goal?: RewardGoal
  /** Día en que se cumplió la meta. */
  earnedDay?: GameDay | null
}

export type RewardGoal =
  | { kind: 'campaign'; targetId: string; label: string }
  | { kind: 'act'; targetId: string; label: string }
  | { kind: 'quest'; targetId: string; label: string }
  | { kind: 'habitStreak'; targetId: string; days: number; label: string }

/** Un canje en la tienda. Se guarda el nombre por si después cambia o se borra el premio. */
export interface Redemption {
  id: string
  rewardId: string
  title: string
  emoji?: string
  cost: number
  day: GameDay
  createdAt: number
}

/** Una misión propuesta por la IA, sin el resto de campos de una misión guardada. */
export interface PlannedMission {
  title: string
  difficulty: Difficulty
  description: string
  steps: string[]
}

/** Ajuste que propone la revisión semanal; se aplica con un toque usando las funciones del juego. */
export interface ReviewAdjustment {
  id: string
  /**
   * `split`: reemplaza una misión atascada por 2 o 3 más pequeñas en su mismo acto.
   * `difficulty`: cambia la dificultad de una misión pendiente.
   * `archiveHabit` / `addHabit`: archiva un hábito o agrega uno nuevo.
   */
  kind: 'split' | 'difficulty' | 'archiveHabit' | 'addHabit'
  reason: string
  /** Principio de la biblioteca en el que se basó la IA (H4, A1…). */
  principle?: string
  questId?: string
  habitId?: string
  /** Título de la misión o el hábito al momento de la revisión, por si después cambia. */
  targetTitle?: string
  difficulty?: Difficulty
  parts?: PlannedMission[]
  habit?: Omit<PlannedMission, 'description'>
  status: 'pending' | 'applied' | 'dismissed'
}

/** Revisión de una semana de juego (lunes a domingo). Su `id` es el lunes. */
export interface WeeklyReview {
  id: GameDay
  createdAt: number
  /** Semana sin actividad: no se llamó a la IA y solo se guarda que ya se vio. */
  empty?: boolean
  summary: string
  wins: string[]
  stuck: Array<{ title: string; cause: string }>
  adjustments: ReviewAdjustment[]
  focus: Array<{ title: string; why: string; questId?: string }>
  model?: string
}

/** La racha guardada cubre hasta `lastSettledDay`; el día en curso aún no cuenta. */
export interface Player {
  id: 'player'
  streak: number
  lastSettledDay: GameDay
  /** Racha al empezar `lastSettledDay`, para poder recalcular ese día si se corrige un hábito de ayer. */
  streakBeforeLast?: number
}

/** Horas en formato HH:MM (24 h). */
export interface NotificationSettings {
  id: 'notifications'
  enabled: boolean
  morning: string
  afternoon: string
  night: string
  weeklyBackupReminder: boolean
}

export interface BackupInfo {
  id: 'backup'
  lastBackupAt: string | null
}

/** La API key no vive aquí: se guarda cifrada aparte (ver platform/secrets.ts). */
export interface AiSettings {
  id: 'ai'
  /** Preguntas previas, detallar misiones y misión del día. */
  fastModel: string
  /** Diseñar campañas y generar actos. */
  mainModel: string
  /** Modo ahorro: todo va al modelo rápido. Sin elegir, solo está activo en la app de pruebas. */
  saver?: boolean
}

export interface PrefsSettings {
  id: 'prefs'
  haptics: boolean
}

export interface CosmeticSettings extends CosmeticChoice {
  id: 'cosmetics'
}

export interface ProfileSettings {
  id: 'profile'
  name: string
  /** Foto recortada a 256×256 como data URL JPEG, o `null` si no hay. */
  photo: string | null
}

export type Setting =
  NotificationSettings | BackupInfo | AiSettings | CosmeticSettings | ProfileSettings | PrefsSettings

export class GameDatabase extends Dexie {
  habits!: EntityTable<Habit, 'id'>
  campaigns!: EntityTable<Campaign, 'id'>
  sideQuests!: EntityTable<SideQuest, 'id'>
  xpEvents!: EntityTable<XpEvent, 'id'>
  player!: EntityTable<Player, 'id'>
  settings!: EntityTable<Setting, 'id'>
  skills!: EntityTable<Skill, 'id'>
  evidence!: EntityTable<Evidence, 'id'>
  dailies!: EntityTable<Daily, 'id'>
  reviews!: EntityTable<WeeklyReview, 'id'>
  habitLogs!: EntityTable<HabitLog, 'id'>
  dailyNotes!: EntityTable<DailyNote, 'id'>
  sleep!: EntityTable<SleepLog, 'id'>
  rewards!: EntityTable<Reward, 'id'>
  redemptions!: EntityTable<Redemption, 'id'>
  routeItems!: EntityTable<RouteItem, 'id'>

  constructor(name = 'real-life-rpg') {
    super(name)
    // Hasta la v4, los hábitos se llamaban «contratos diarios» y vivían en la tabla `bounties`.
    this.version(1).stores({
      bounties: 'id',
      campaigns: 'id',
      sideQuests: 'id, campaignId',
      xpEvents: 'id, &[taskId+day], taskId, day',
      player: 'id',
    })
    this.version(2).stores({ settings: 'id' })
    // v3: actos, habilidades, bitácora y misión del día. Las campañas y misiones existentes no
    // cambian: sin `acts`, todo cuenta como Acto 1 sin bloqueo.
    this.version(3)
      .stores({
        xpEvents: 'id, &[taskId+day], taskId, day, skillId',
        skills: 'id, parentId',
        evidence: 'id, taskId, createdAt',
        dailies: 'id',
      })
      .upgrade(async (transaction) => {
        // El modelo único de antes pasa a ser el modelo rápido.
        await transaction
          .table('settings')
          .where('id')
          .equals('ai')
          .modify((setting: Record<string, unknown>) => {
            if (typeof setting.model === 'string' && setting.model.trim()) setting.fastModel = setting.model
            delete setting.model
          })
      })
    // v4: revisiones semanales. Nada existente cambia.
    this.version(4).stores({ reviews: 'id' })
    // v5: los contratos diarios pasan a ser hábitos diarios, con un registro por día. Cada día que
    // se cumplió un contrato queda como «hecho» y su XP se conserva.
    this.version(5)
      .stores({ habits: 'id', habitLogs: 'id, habitId, day' })
      .upgrade(async (transaction) => {
        const bounties = (await transaction.table('bounties').toArray()) as Array<Omit<Habit, 'frequency' | 'order'>>
        bounties.sort((a, b) => a.createdAt - b.createdAt)
        await transaction
          .table('habits')
          .bulkAdd(bounties.map((bounty, order) => ({ ...bounty, frequency: { kind: 'daily' }, order })))
        const logs: HabitLog[] = []
        await transaction
          .table('xpEvents')
          .filter((event: { kind: string }) => event.kind === 'bounty')
          .modify((event: XpEvent & { kind: string }) => {
            event.kind = 'habit'
            logs.push({ id: `${event.taskId}:${event.day}`, habitId: event.taskId, day: event.day, state: 'done' })
          })
        await transaction.table('habitLogs').bulkPut(logs)
        await transaction
          .table('evidence')
          .filter((item: { taskKind: string }) => item.taskKind === 'bounty')
          .modify((item: { taskKind: string }) => void (item.taskKind = 'habit'))
        await transaction
          .table('reviews')
          .toCollection()
          .modify((review: { adjustments: Array<Record<string, unknown>> }) => {
            review.adjustments = review.adjustments.map(migrateAdjustment)
          })
      })
    this.version(6).stores({ bounties: null })
    // v7: notas diarias de la bitácora.
    this.version(7).stores({ dailyNotes: 'id' })
    // v8: registro de sueño.
    this.version(8).stores({ sleep: 'id' })
    // v9: tres misiones del día (índice por día), premios y canjes. Las misiones del día de antes
    // conservan su id (el día) y pasan a ser la número 1 de ese día.
    this.version(9)
      .stores({ dailies: 'id, day', rewards: 'id', redemptions: 'id, day' })
      .upgrade(async (transaction) => {
        await transaction
          .table('dailies')
          .toCollection()
          .modify((daily: Partial<Daily> & { id: string }) => {
            daily.day ??= daily.id.slice(0, 10)
            daily.slot ??= 1
          })
      })
    // v10: ruta progresiva de hábitos.
    this.version(10).stores({ routeItems: 'id, order' })
  }
}

/** Ajustes de revisiones guardadas antes de que los contratos se llamaran hábitos. */
export function migrateAdjustment(adjustment: Record<string, unknown>): Record<string, unknown> {
  const { kind, bountyId, bounty, ...rest } = adjustment
  return {
    ...rest,
    kind: kind === 'archiveBounty' ? 'archiveHabit' : kind === 'addBounty' ? 'addHabit' : kind,
    ...(bountyId !== undefined ? { habitId: bountyId } : {}),
    ...(bounty !== undefined ? { habit: bounty } : {}),
  }
}
