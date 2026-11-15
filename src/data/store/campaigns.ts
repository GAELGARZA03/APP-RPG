// Campañas y actos: vistas, crear desde un plan de la IA, borrar y restablecer.
import { type GameDay, gameDayOf } from '../../game/gameDay'
import {
  type ActState,
  type Difficulty,
  campaignProgressPercent,
  campaignState,
  isResolved,
  lockMessage,
  questXp,
  skillKey,
} from '../../game/rules'
import type { Act, Campaign, CampaignAnalysis, GameDatabase, SideQuest } from '../db'
import { createBounty } from './bounties'
import { getHud } from './hud'
import { addQuest, createSideQuest } from './quests'
import { type TaskInput, allTables, byCreation, isActiveOn, pathOf, skillMap } from './shared'
import { pruneSkills, skillResolver } from './skills'

export interface QuestView extends SideQuest {
  xp: number
  /** Motivo por el que está bloqueada, o `null`. */
  lock: string | null
}

export interface ActView extends Act {
  number: number
  state: ActState
  quests: QuestView[]
}

function orderQuests(quests: ReadonlyArray<SideQuest>): SideQuest[] {
  return [...quests].sort((a, b) => Number(a.boss ?? false) - Number(b.boss ?? false) || byCreation(a, b))
}

/** Campaña con sus actos, bloqueos y progreso ya calculados. */
export function buildCampaignView(campaign: Campaign, campaignQuests: SideQuest[]) {
  const legacy = !campaign.acts || campaign.acts.length === 0
  const acts: Act[] = legacy ? [{ id: 'legacy', title: '', goal: '', difficulty: 1, status: 'ready' }] : campaign.acts!
  const state = campaignState(acts, campaignQuests)
  const actViews: ActView[] = acts.map((act, index) => ({
    ...act,
    number: index + 1,
    state: state.states[index],
    quests: orderQuests(state.questsByAct[index] as SideQuest[]).map((quest) => {
      const lock = state.locks.get(quest.id)
      return { ...quest, xp: questXp(quest), lock: lock ? lockMessage(lock) : null }
    }),
  }))

  return {
    ...campaign,
    legacy,
    actViews,
    sideQuests: actViews.flatMap((act) => act.quests),
    /** Número del primer acto sin terminar, o `null` si la campaña está completa. */
    currentAct: state.currentIndex === null ? null : state.currentIndex + 1,
    progress: campaignProgressPercent(campaignQuests),
    resolved: campaignQuests.filter(isResolved).length,
  }
}

export type CampaignView = ReturnType<typeof buildCampaignView>

export async function getMissions(db: GameDatabase) {
  return db.transaction('r', db.campaigns, db.sideQuests, async () => {
    const campaigns = (await db.campaigns.toArray()).sort(byCreation)
    const sideQuests = (await db.sideQuests.toArray()).sort(byCreation)

    return {
      campaigns: campaigns.map((campaign) =>
        buildCampaignView(
          campaign,
          sideQuests.filter((quest) => quest.campaignId === campaign.id),
        ),
      ),
      looseSideQuests: sideQuests.filter((quest) => quest.campaignId === null),
    }
  })
}

export async function getCampaign(db: GameDatabase, id: string): Promise<CampaignView | null> {
  return db.transaction('r', db.campaigns, db.sideQuests, async () => {
    const campaign = await db.campaigns.get(id)
    if (!campaign) return null
    return buildCampaignView(campaign, await db.sideQuests.where('campaignId').equals(id).toArray())
  })
}

export async function getCampaignProgress(db: GameDatabase, campaignId: string): Promise<number> {
  const sideQuests = await db.sideQuests.where('campaignId').equals(campaignId).toArray()
  return campaignProgressPercent(sideQuests)
}

export async function createCampaign(db: GameDatabase, title: string, now = new Date()): Promise<Campaign> {
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    title,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
  }
  await db.campaigns.add(campaign)
  return campaign
}

export async function renameCampaign(db: GameDatabase, id: string, title: string): Promise<void> {
  await db.campaigns.update(id, { title })
}

/** Quita una rama del árbol con todas sus sub-ramas; lo que apuntaba a ellas deja de sumar a una habilidad. */
async function removeSkillBranch(db: GameDatabase, branchId: string): Promise<void> {
  const skills = await db.skills.toArray()
  const doomed = new Set<string>([branchId])
  let grew = true
  while (grew) {
    grew = false
    for (const skill of skills) {
      if (skill.parentId && doomed.has(skill.parentId) && !doomed.has(skill.id)) {
        doomed.add(skill.id)
        grew = true
      }
    }
  }
  const ids = [...doomed]
  const unlink = (item: { skillId?: string }) => {
    if (item.skillId && doomed.has(item.skillId)) delete item.skillId
  }
  await db.xpEvents.where('skillId').anyOf(ids).modify(unlink)
  await db.bounties.toCollection().modify(unlink)
  await db.dailies.toCollection().modify(unlink)
  await db.sideQuests.toCollection().modify(unlink)
  await db.skills.bulkDelete(ids)
}

/**
 * Borra la campaña con todo lo suyo: actos, misiones, evidencias y su rama del árbol
 * (salvo que otra campaña la comparta). Los contratos diarios que se crearon con ella se archivan.
 * El XP ya ganado se conserva: el nivel no baja.
 */
export async function deleteCampaign(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const campaign = await db.campaigns.get(id)
    const questIds = (await db.sideQuests.where('campaignId').equals(id).toArray()).map((quest) => quest.id)
    await db.evidence.where('taskId').anyOf(questIds).delete()
    await db.sideQuests.where('campaignId').equals(id).delete()
    await db.campaigns.delete(id)

    // Archivar (no borrar) conserva el historial y no altera la racha de días ya cerrados.
    const today = gameDayOf(now)
    await db.bounties
      .filter((bounty) => bounty.campaignId === id && bounty.archivedDay === null)
      .modify({ archivedDay: today })

    const branchId = campaign?.skillId
    if (branchId && !(await db.campaigns.toArray()).some((other) => other.skillId === branchId)) {
      await removeSkillBranch(db, branchId)
    }
    await pruneSkills(db)
  })
}

/**
 * Restablece el juego: borra campañas, misiones, árbol, bitácora, misión del día, XP y racha.
 * Con el nivel en 1, los temas, títulos y sonidos vuelven a bloquearse, y la elección regresa a la inicial.
 * No toca la API key, los modelos, el perfil ni los recordatorios.
 */
export async function resetProgress(db: GameDatabase, options: { keepBounties: boolean }): Promise<void> {
  await db.transaction('rw', [...allTables(db), db.settings], async () => {
    await Promise.all(
      [db.campaigns, db.sideQuests, db.xpEvents, db.skills, db.evidence, db.dailies, db.player, db.reviews].map((table) =>
        table.clear(),
      ),
    )
    if (options.keepBounties) {
      // Se quedan solo los contratos activos, ya sin historial ni enlaces a lo que se borró.
      await db.bounties.filter((bounty) => bounty.archivedDay !== null).delete()
      await db.bounties.toCollection().modify((bounty) => {
        delete bounty.stepsDone
        delete bounty.skillId
        delete bounty.campaignId
      })
    } else await db.bounties.clear()
    await db.settings.delete('cosmetics')
  })
}

/** Crea de una vez la campaña y las misiones aceptadas de un plan sin actos. */
export async function acceptPlan(
  db: GameDatabase,
  plan: {
    campaign: string
    sideQuests: TaskInput[]
    bounties: TaskInput[]
  },
  now = new Date(),
): Promise<Campaign> {
  return db.transaction('rw', db.campaigns, db.sideQuests, db.bounties, async () => {
    const campaign = await createCampaign(db, plan.campaign, now)
    // Se suma un milisegundo por misión para conservar el orden propuesto.
    for (const [index, quest] of plan.sideQuests.entries()) {
      await createSideQuest(db, { ...quest, campaignId: campaign.id }, new Date(now.getTime() + index + 1))
    }
    for (const [index, bounty] of plan.bounties.entries()) {
      await createBounty(db, bounty, new Date(now.getTime() + index + 1))
    }
    return campaign
  })
}

/** Misión propuesta por la IA: `skill` es el nombre de su sub-rama. */
export type MissionInput = TaskInput & { skill?: string }

export interface CampaignPlanInput {
  campaign: string
  analysis?: CampaignAnalysis
  brief?: Campaign['brief']
  skills?: { area: string; branch: string; leaves: string[] }
  acts: Array<{ title: string; goal: string; difficulty: Difficulty }>
  /** Misiones del Acto 1. */
  missions: MissionInput[]
  boss: MissionInput | null
  bounties: MissionInput[]
}

function questFields(mission: MissionInput, skillId: string | undefined) {
  const { skill: _skill, ...fields } = mission
  return { ...fields, ...(skillId ? { skillId } : {}) }
}

/**
 * Crea la campaña diseñada por la IA en una sola transacción: actos, misiones del Acto 1,
 * misión jefe (en el último acto), habilidades y contratos aceptados. Si algo falla, no queda nada a medias.
 */
export async function acceptCampaignPlan(
  db: GameDatabase,
  plan: CampaignPlanInput,
  now = new Date(),
): Promise<Campaign> {
  return db.transaction('rw', allTables(db), async () => {
    const resolver = await skillResolver(db, plan.campaign, now)
    let branchId: string | undefined
    if (plan.skills && skillKey(plan.skills.branch)) {
      const area = skillKey(plan.skills.area) ? await resolver.ensure(plan.skills.area, null) : null
      const sameAsArea = area && skillKey(area.name) === skillKey(plan.skills.branch)
      branchId = sameAsArea ? area.id : (await resolver.ensure(plan.skills.branch, area?.id ?? null)).id
      for (const leaf of plan.skills.leaves) await resolver.leaf(branchId, leaf)
    }

    const acts: Act[] = plan.acts.map((act, index) => ({
      id: crypto.randomUUID(),
      title: act.title,
      goal: act.goal,
      difficulty: act.difficulty,
      status: index === 0 ? 'ready' : 'planned',
      ...(index === 0 ? { readyDay: gameDayOf(now) } : {}),
    }))
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      title: plan.campaign,
      createdAt: now.getTime(),
      createdDay: gameDayOf(now),
      acts,
      ...(plan.analysis ? { analysis: plan.analysis } : {}),
      ...(plan.brief ? { brief: plan.brief } : {}),
      ...(branchId ? { skillId: branchId } : {}),
    }
    await db.campaigns.add(campaign)

    for (const [index, mission] of plan.missions.entries()) {
      await addQuest(db, {
        ...questFields(mission, await resolver.leaf(branchId, mission.skill)),
        campaignId: campaign.id,
        actId: acts[0].id,
        createdAt: now.getTime() + index + 1,
        createdDay: gameDayOf(now),
      })
    }
    if (plan.boss) {
      await addQuest(db, {
        ...questFields(plan.boss, await resolver.leaf(branchId, plan.boss.skill)),
        campaignId: campaign.id,
        actId: acts[acts.length - 1].id,
        boss: true,
        createdAt: now.getTime() + 500,
        createdDay: gameDayOf(now),
      })
    }
    for (const [index, bounty] of plan.bounties.entries()) {
      await createBounty(
        db,
        { ...questFields(bounty, await resolver.leaf(branchId, bounty.skill)), campaignId: campaign.id },
        new Date(now.getTime() + index + 1),
      )
    }
    return campaign
  })
}

/**
 * Guarda las misiones generadas para un acto. Solo si ese acto sigue pendiente y es el actual:
 * así una respuesta que llega tarde o repetida no crea misiones duplicadas ni actos fantasma.
 */
export async function addActMissions(
  db: GameDatabase,
  campaignId: string,
  actId: string,
  missions: MissionInput[],
  now = new Date(),
): Promise<boolean> {
  return db.transaction('rw', allTables(db), async () => {
    const campaign = await db.campaigns.get(campaignId)
    const acts = campaign?.acts
    const index = acts?.findIndex((act) => act.id === actId) ?? -1
    if (!campaign || !acts || index === -1 || acts[index].status !== 'planned' || missions.length === 0) return false

    const quests = await db.sideQuests.where('campaignId').equals(campaignId).toArray()
    if (campaignState(acts, quests).currentIndex !== index) return false

    const resolver = await skillResolver(db, campaign.title, now)
    for (const [position, mission] of missions.entries()) {
      await addQuest(db, {
        ...questFields(mission, await resolver.leaf(campaign.skillId, mission.skill)),
        campaignId,
        actId,
        createdAt: now.getTime() + position + 1,
        createdDay: gameDayOf(now),
      })
    }
    await db.campaigns.update(campaignId, {
      acts: acts.map((act, position) =>
        position === index ? { ...act, status: 'ready' as const, readyDay: gameDayOf(now) } : act,
      ),
    })
    return true
  })
}

/** Cómo le fue al jugador en los actos ya cerrados; la IA lo usa para diseñar el siguiente. */
export async function getActReport(db: GameDatabase, campaignId: string) {
  const view = await getCampaign(db, campaignId)
  if (!view || view.legacy || view.currentAct === null) return null
  const next = view.actViews[view.currentAct - 1]
  if (next.status !== 'planned') return null

  const daysBetween = (from: GameDay, to: GameDay) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

  return {
    view,
    next,
    boss: view.sideQuests.find((quest) => quest.boss) ?? null,
    previous: view.actViews.slice(0, view.currentAct - 1).map((act) => {
      const start = act.readyDay ?? view.createdDay
      const lastDay = act.quests.reduce((latest, quest) => {
        const day = quest.completedDay ?? quest.skippedDay ?? start
        return day > latest ? day : latest
      }, start)
      return {
        number: act.number,
        title: act.title,
        days: daysBetween(start, lastDay),
        missions: act.quests.map((quest) => ({
          title: quest.title,
          difficulty: quest.difficulty,
          skipped: (quest.skippedDay ?? null) !== null,
          undone: quest.undoCount ?? 0,
        })),
      }
    }),
  }
}

export type ActReport = NonNullable<Awaited<ReturnType<typeof getActReport>>>

/** Solo lo necesario para que la IA no repita campañas ni habilidades. Nada más personal. */
export async function getAiContext(db: GameDatabase, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const hud = await getHud(db, today)
    const skills = await skillMap(db)
    const quests = await db.sideQuests.toArray()
    const campaigns = (await db.campaigns.toArray())
      .filter((campaign) => {
        const own = quests.filter((quest) => quest.campaignId === campaign.id)
        return campaignState(campaign.acts, own).currentIndex !== null
      })
      .map((campaign) => ({ title: campaign.title, skill: pathOf(skills, campaign.skillId) }))
    const bounties = (await db.bounties.toArray()).filter((bounty) => isActiveOn(bounty, today)).map((b) => b.title)
    // Solo las rutas hasta las hojas: las ramas intermedias ya van incluidas en ellas.
    const parents = new Set([...skills.values()].map((skill) => skill.parentId))
    const skillPaths = [...skills.values()]
      .filter((skill) => !parents.has(skill.id))
      .map((skill) => pathOf(skills, skill.id)!)
      .slice(0, 60)

    return { level: hud.level, streak: hud.streak, campaigns, bounties, skillPaths }
  })
}

export type AiContext = Awaited<ReturnType<typeof getAiContext>>
