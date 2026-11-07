import Dexie, { type EntityTable } from 'dexie'
import type { GameDay } from '../game/gameDay'
import type { Difficulty } from '../game/rules'

export interface Bounty {
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

export interface SideQuest {
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

export class GameDatabase extends Dexie {
  bounties!: EntityTable<Bounty, 'id'>
  campaigns!: EntityTable<Campaign, 'id'>
  sideQuests!: EntityTable<SideQuest, 'id'>
  xpEvents!: EntityTable<XpEvent, 'id'>
  player!: EntityTable<Player, 'id'>

  constructor(name = 'real-life-rpg') {
    super(name)
    this.version(1).stores({
      bounties: 'id',
      campaigns: 'id',
      sideQuests: 'id, campaignId',
      xpEvents: 'id, &[taskId+day], taskId, day',
      player: 'id',
    })
  }
}
