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
}

export interface Bounty extends TaskDetail {
  id: string
  title: string
  difficulty: Difficulty
  createdAt: number
  createdDay: GameDay
  archivedDay: GameDay | null
}

export interface Campaign {
  id: string
  title: string
  createdAt: number
  createdDay: GameDay
}

export interface SideQuest extends TaskDetail {
  id: string
  title: string
  difficulty: Difficulty
  campaignId: string | null
  createdAt: number
  createdDay: GameDay
  completedDay: GameDay | null
}

/** Registro de cada recompensa. El XP total siempre es la suma de estos eventos. */
export interface XpEvent {
  id: string
  kind: 'bounty' | 'sideQuest'
  taskId: string
  day: GameDay
  xp: number
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
  model: string
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

export type Setting = NotificationSettings | BackupInfo | AiSettings | CosmeticSettings | ProfileSettings

export class GameDatabase extends Dexie {
  bounties!: EntityTable<Bounty, 'id'>
  campaigns!: EntityTable<Campaign, 'id'>
  sideQuests!: EntityTable<SideQuest, 'id'>
  xpEvents!: EntityTable<XpEvent, 'id'>
  player!: EntityTable<Player, 'id'>
  settings!: EntityTable<Setting, 'id'>

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
  }
}
