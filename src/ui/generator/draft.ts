// Borrador del generador: pasos, memoria entre aperturas y conversión del diseño.
import type { CampaignDesign, MissionPlan, Question } from '../../ai/gemini'

export interface DraftItem extends MissionPlan {
  key: number
  include: boolean
}

export interface Draft {
  design: CampaignDesign
  campaign: string
  missions: DraftItem[]
  boss: DraftItem
  bounties: DraftItem[]
}

export type Step =
  | { kind: 'idea' }
  | { kind: 'asking' }
  | { kind: 'questions' }
  | { kind: 'designing'; fast: boolean }
  | { kind: 'failed'; stage: 'questions' | 'design'; message: string; offerFast: boolean }
  | { kind: 'preview' }

/**
 * Lo escrito y respondido sobrevive a cerrar la hoja por accidente o a un error de red.
 * Nada se guarda en la base de datos hasta aceptar la vista previa.
 */
export const memory: { idea: string; questions: Question[]; answers: Record<number, string>; draft: Draft | null } = {
  idea: '',
  questions: [],
  answers: {},
  draft: null,
}

/** Olvida el borrador. Se usa al crear la campaña (y en las pruebas). */
export function forget() {
  memory.idea = ''
  memory.questions = []
  memory.answers = {}
  memory.draft = null
}

export function toDraft(design: CampaignDesign): Draft {
  let key = 0
  const item = (mission: MissionPlan, include: boolean): DraftItem => ({ ...mission, key: key++, include })
  return {
    design,
    campaign: design.campaign,
    missions: design.missions.map((mission) => item(mission, true)),
    boss: item(design.boss, true),
    // Los contratos sugeridos empiezan desmarcados: si se aceptan, cuentan para la racha diaria.
    bounties: design.bounties.map((bounty) => item(bounty, false)),
  }
}

export function chosen(items: DraftItem[]): MissionPlan[] {
  return items
    .filter((item) => item.include && item.title.trim())
    .map(({ key: _key, include: _include, ...mission }) => ({ ...mission, title: mission.title.trim() }))
}
