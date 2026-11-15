// Hitos automáticos para la bitácora de progreso: niveles, actos cerrados, jefes derrotados y dominio de habilidades.
// No se guardan: se calculan siempre a partir de los datos, así que deshacer algo también quita su hito.
import type { GameDay } from '../../game/gameDay'
import { isResolved, levelProgress, MASTERY_LEVELS } from '../../game/rules'
import type { GameDatabase } from '../db'
import { buildCampaignView } from './campaigns'
import { allTables } from './shared'

export type MilestoneKind = 'level' | 'act' | 'boss' | 'mastery' | 'reward'

export interface Milestone {
  id: string
  day: GameDay
  kind: MilestoneKind
  title: string
  subtitle?: string
}

/** Todos los hitos, del más reciente al más antiguo. */
export async function getMilestones(db: GameDatabase): Promise<Milestone[]> {
  return db.transaction('r', allTables(db), async () => {
    const milestones: Milestone[] = []
    const events = (await db.xpEvents.toArray()).sort((a, b) => a.day.localeCompare(b.day))

    // Niveles: el día en que el XP acumulado cruzó cada nivel.
    let total = 0
    let level = 1
    for (const event of events) {
      total += event.xp
      const reached = levelProgress(total).level
      for (let next = level + 1; next <= reached; next++) {
        milestones.push({ id: `nivel-${next}`, day: event.day, kind: 'level', title: `Subiste al nivel ${next}` })
      }
      level = Math.max(level, reached)
    }

    // Dominio: el día en que cada habilidad llegó a Aprendiz, Competente, Experto o Maestro.
    const skills = new Map((await db.skills.toArray()).map((skill) => [skill.id, skill.name]))
    const bySkill = new Map<string, number>()
    for (const event of events) {
      if (!event.skillId || !skills.has(event.skillId)) continue
      const before = bySkill.get(event.skillId) ?? 0
      const after = before + event.xp
      bySkill.set(event.skillId, after)
      for (const step of MASTERY_LEVELS.slice(1)) {
        if (before < step.xp && after >= step.xp) {
          milestones.push({
            id: `dominio-${event.skillId}-${step.name}`,
            day: event.day,
            kind: 'mastery',
            title: `${skills.get(event.skillId)}: ${step.name}`,
            subtitle: 'Nuevo nivel de dominio',
          })
        }
      }
    }

    // Actos cerrados y jefes derrotados.
    const quests = await db.sideQuests.toArray()
    for (const campaign of await db.campaigns.toArray()) {
      const view = buildCampaignView(
        campaign,
        quests.filter((quest) => quest.campaignId === campaign.id),
      )
      for (const act of view.actViews) {
        const boss = act.quests.find((quest) => quest.boss && quest.completedDay)
        if (boss?.completedDay) {
          milestones.push({
            id: `jefe-${boss.id}`,
            day: boss.completedDay,
            kind: 'boss',
            title: `Jefe derrotado: ${boss.title}`,
            subtitle: `«${campaign.title}» completada`,
          })
        }
        if (view.legacy || act.state !== 'done' || act.status !== 'ready' || act.quests.length === 0) continue
        if (!act.quests.every(isResolved) || boss) continue
        const closedOn = act.quests
          .map((quest) => quest.completedDay ?? quest.skippedDay ?? '')
          .sort()
          .at(-1)!
        milestones.push({
          id: `acto-${act.id}`,
          day: closedOn,
          kind: 'act',
          title: `Acto ${act.number} cerrado: ${act.title}`,
          subtitle: campaign.title,
        })
      }
    }

    // Premios: los ganados al cumplir una meta y los canjes de la tienda.
    for (const reward of await db.rewards.toArray()) {
      if (reward.goal && reward.earnedDay) {
        milestones.push({
          id: `premio-${reward.id}`,
          day: reward.earnedDay,
          kind: 'reward',
          title: `Ganaste tu premio: ${reward.emoji ? `${reward.emoji} ` : ''}${reward.title}`,
          subtitle: reward.goal.label,
        })
      }
    }
    for (const item of await db.redemptions.toArray()) {
      milestones.push({
        id: `canje-${item.id}`,
        day: item.day,
        kind: 'reward',
        title: `Canjeaste: ${item.emoji ? `${item.emoji} ` : ''}${item.title}`,
        subtitle: item.cost > 0 ? `${item.cost} de oro` : 'Premio ganado',
      })
    }

    return milestones.sort((a, b) => b.day.localeCompare(a.day))
  })
}
