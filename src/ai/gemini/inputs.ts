// Textos que se le envían al modelo.
import type { Difficulty } from '../../game/rules'
import { type Answer, MAX_IDEA_LENGTH, type PlayerContext } from './types'

function contextLines(context: PlayerContext): string[] {
  return [
    `Nivel del jugador: ${context.level}. Racha actual: ${context.streak} días.`,
    context.campaigns.length > 0
      ? `Campañas activas (no las repitas): ${context.campaigns
          .map((campaign) => (campaign.skill ? `"${campaign.title}" [${campaign.skill}]` : `"${campaign.title}"`))
          .join('; ')}.`
      : 'No tiene otras campañas activas.',
    context.bounties.length > 0
      ? `Contratos diarios que ya tiene (${context.bounties.length}): ${context.bounties.map((b) => `"${b}"`).join('; ')}.`
      : 'No tiene contratos diarios.',
    context.skillPaths.length > 0
      ? `Habilidades existentes en su árbol (reutiliza estos nombres si aplican): ${context.skillPaths.join('; ')}.`
      : 'Su árbol de habilidades está vacío.',
  ]
}

export function designInput(idea: string, answers: Answer[], context: PlayerContext): string {
  const answered = answers.filter((answer) => answer.answer.trim())
  return [
    `META DEL JUGADOR:\n${idea.slice(0, MAX_IDEA_LENGTH)}`,
    answered.length > 0
      ? `RESPUESTAS A LAS PREGUNTAS PREVIAS:\n${answered.map((item) => `- ${item.question} → ${item.answer}`).join('\n')}`
      : 'El jugador no respondió preguntas previas: asume lo más prudente.',
    `CONTEXTO:\n${contextLines(context).join('\n')}`,
  ].join('\n\n')
}

/** Lo que la IA necesita para diseñar el siguiente acto. */
export interface ActBrief {
  campaign: string
  idea: string
  answers: Answer[]
  diagnosis: string
  successCriteria: string
  acts: Array<{ number: number; title: string; goal: string; difficulty: Difficulty }>
  nextAct: number
  previous: Array<{
    number: number
    title: string
    days: number
    missions: Array<{ title: string; difficulty: Difficulty; skipped: boolean; undone: number }>
  }>
  boss: string | null
  skills: string[]
}

export function actInput(brief: ActBrief): string {
  const history = brief.previous.map((act) => {
    const missions = act.missions.map((mission) => {
      const result = mission.skipped
        ? 'SALTADA (ya lo sabía)'
        : `completada${mission.undone > 0 ? `, la deshizo ${mission.undone} ${mission.undone === 1 ? 'vez' : 'veces'}` : ''}`
      return `  - "${mission.title}" (dificultad ${mission.difficulty}): ${result}`
    })
    return [
      `Acto ${act.number} "${act.title}": lo terminó en ${act.days} ${act.days === 1 ? 'día' : 'días'}.`,
      ...missions,
    ].join('\n')
  })

  return [
    `CAMPAÑA: ${brief.campaign}`,
    brief.idea ? `META ORIGINAL:\n${brief.idea.slice(0, 2000)}` : null,
    brief.answers.length > 0
      ? `LO QUE RESPONDIÓ AL INICIO:\n${brief.answers.map((item) => `- ${item.question} → ${item.answer}`).join('\n')}`
      : null,
    brief.diagnosis ? `DIAGNÓSTICO: ${brief.diagnosis}` : null,
    brief.successCriteria ? `CRITERIO DE ÉXITO: ${brief.successCriteria}` : null,
    `ACTOS:\n${brief.acts.map((act) => `${act.number}. ${act.title} (dificultad ${act.difficulty}): ${act.goal}`).join('\n')}`,
    `CÓMO LE FUE:\n${history.join('\n')}`,
    brief.boss ? `MISIÓN JEFE AL FINAL DE LA CAMPAÑA: "${brief.boss}"` : null,
    brief.skills.length > 0 ? `SUB-HABILIDADES DE LA CAMPAÑA: ${brief.skills.join('; ')}` : null,
    `Diseña ahora las misiones del Acto ${brief.nextAct}.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
