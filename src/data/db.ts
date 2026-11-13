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
}

export interface Bounty extends TaskDetail {
  id: string
  title: string
  difficulty: Difficulty
  createdAt: number
  createdDay: GameDay
  archivedDay: GameDay | null
  /** Objetivos marcados; solo valen para ese día de juego. */
  stepsDone?: { day: GameDay; done: number[] }
  /** Campaña con la que se creó; al borrarla, el contrato se archiva con ella. */
  campaignId?: string
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
export interface Daily extends TaskDetail {
  id: GameDay
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
  taskKind: 'sideQuest' | 'bounty' | 'daily'
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
  kind: 'bounty' | 'sideQuest' | 'daily'
  taskId: string
  day: GameDay
  xp: number
  skillId?: string
}

/** La racha guardada cubre hasta `lastSettledDay`; el día en curso aún no cuenta. */
export interface Player {
  id: 'player'
  streak: number
  lastSettledDay: GameDay
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

export type Setting = NotificationSettings | BackupInfo | AiSettings | CosmeticSettings | ProfileSettings | PrefsSettings

export class GameDatabase extends Dexie {
  bounties!: EntityTable<Bounty, 'id'>
  campaigns!: EntityTable<Campaign, 'id'>
  sideQuests!: EntityTable<SideQuest, 'id'>
  xpEvents!: EntityTable<XpEvent, 'id'>
  player!: EntityTable<Player, 'id'>
  settings!: EntityTable<Setting, 'id'>
  skills!: EntityTable<Skill, 'id'>
  evidence!: EntityTable<Evidence, 'id'>
  dailies!: EntityTable<Daily, 'id'>

  constructor(name = 'real-life-rpg') {
    super(name)
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
  }
}
