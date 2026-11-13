import { addDays, gameDayOf, type GameDay } from '../game/gameDay'
import {
  bountyXp,
  campaignProgressPercent,
  campaignState,
  dailyXp,
  isResolved,
  levelProgress,
  lockMessage,
  nextStreak,
  questXp,
  skillKey,
  streakBonusPercent,
  type ActState,
  type DayOutcome,
  type Difficulty,
} from '../game/rules'
import type {
  Act,
  Bounty,
  Campaign,
  CampaignAnalysis,
  Daily,
  Evidence,
  GameDatabase,
  Player,
  SideQuest,
  Skill,
  TaskDetail,
} from './db'

export type TaskInput = { title: string; difficulty: Difficulty } & TaskDetail
export type TaskChanges = Partial<TaskInput>

/** Resultado de completar, saltar o marcar un objetivo. */
export interface Outcome {
  ok: boolean
  xp: number
  /** `locked`: la misión está bloqueada. `evidence`: la misión jefe pide una foto o una nota. */
  blocked?: 'locked' | 'evidence'
  boss?: boolean
  /** Presente cuando esta acción cerró un acto. */
  act?: ActCompletion
}

export interface ActCompletion {
  campaignId: string
  campaignTitle: string
  actNumber: number
  actTitle: string
  next: { number: number; title: string; planned: boolean } | null
}

const FAILED: Outcome = { ok: false, xp: 0 }

export const MAX_PHOTOS_PER_TASK = 4
export const MAX_NOTES_PER_TASK = 6
export const MAX_NOTE_LENGTH = 500
const MAX_SKILL_NAME = 40

function isActiveOn(bounty: Bounty, day: GameDay): boolean {
  return bounty.createdDay <= day && (bounty.archivedDay === null || bounty.archivedDay > day)
}

function outcomeOf(bounties: Bounty[], completedTaskIds: Set<string>, day: GameDay): DayOutcome {
  const active = bounties.filter((bounty) => isActiveOn(bounty, day))
  if (active.length === 0) return 'neutral'
  return active.every((bounty) => completedTaskIds.has(bounty.id)) ? 'fulfilled' : 'failed'
}

async function completedTaskIdsOn(db: GameDatabase, day: GameDay): Promise<Set<string>> {
  const events = await db.xpEvents.where('day').equals(day).toArray()
  return new Set(events.map((event) => event.taskId))
}

function byCreation(a: { createdAt: number }, b: { createdAt: number }): number {
  return a.createdAt - b.createdAt
}

function allSteps(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index)
}

/**
 * Calcula la racha con todos los días ya cerrados, sin escribir nada.
 * La racha guardada solo se actualiza cuando hay un cambio (ver `settleClosedDays`).
 */
async function projectPlayer(db: GameDatabase, today: GameDay): Promise<Player> {
  const yesterday = addDays(today, -1)
  const player = (await db.player.get('player')) ?? {
    id: 'player',
    streak: 0,
    lastSettledDay: yesterday,
  }
  if (player.lastSettledDay >= yesterday) return player

  const bounties = await db.bounties.toArray()
  const events = await db.xpEvents
    .where('day')
    .between(addDays(player.lastSettledDay, 1), today)
    .toArray()

  const completedByDay = new Map<GameDay, Set<string>>()
  for (const event of events) {
    const completed = completedByDay.get(event.day) ?? new Set<string>()
    completed.add(event.taskId)
    completedByDay.set(event.day, completed)
  }

  let { streak, lastSettledDay: day } = player
  while (day < yesterday) {
    day = addDays(day, 1)
    streak = nextStreak(streak, outcomeOf(bounties, completedByDay.get(day) ?? new Set(), day))
  }

  return { ...player, streak, lastSettledDay: yesterday }
}

async function settleClosedDays(db: GameDatabase, today: GameDay): Promise<Player> {
  const player = await projectPlayer(db, today)
  await db.player.put(player)
  return player
}

function gameTables(db: GameDatabase) {
  return [db.bounties, db.sideQuests, db.xpEvents, db.player]
}

function allTables(db: GameDatabase) {
  return [db.bounties, db.campaigns, db.sideQuests, db.xpEvents, db.player, db.skills, db.evidence, db.dailies]
}

// --- Lecturas -------------------------------------------------------------

export async function getHud(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const events = await db.xpEvents.toArray()
    const bounties = await db.bounties.toArray()
    const completedToday = new Set(
      events.filter((event) => event.day === today).map((event) => event.taskId),
    )
    const todayFulfilled = outcomeOf(bounties, completedToday, today) === 'fulfilled'
    const totalXp = events.reduce((sum, event) => sum + event.xp, 0)

    return {
      ...levelProgress(totalXp),
      totalXp,
      completedTasks: events.length,
      streak: player.streak + (todayFulfilled ? 1 : 0),
      streakBonusPercent: streakBonusPercent(player.streak),
      todayFulfilled,
    }
  })
}

export type Hud = Awaited<ReturnType<typeof getHud>>

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const WEEK_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** done/missed/rest = día cerrado (cumplido, fallado o sin contratos); today-done = hoy ya cumplido. */
export type WeekDayStatus = 'done' | 'missed' | 'rest' | 'today' | 'today-done' | 'future'

/** Semana actual (lunes a domingo) con el resultado de cada día. */
export async function getWeek(db: GameDatabase, today: GameDay) {
  return db.transaction('r', db.bounties, db.xpEvents, async () => {
    const [year, month, date] = today.split('-').map(Number)
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay()
    const monday = addDays(today, -((weekday + 6) % 7))
    const bounties = await db.bounties.toArray()
    const events = await db.xpEvents.where('day').between(monday, addDays(monday, 7)).toArray()

    const completedByDay = new Map<GameDay, Set<string>>()
    for (const event of events) {
      const completed = completedByDay.get(event.day) ?? new Set<string>()
      completed.add(event.taskId)
      completedByDay.set(event.day, completed)
    }

    return WEEK_LABELS.map((label, index) => {
      const day = addDays(monday, index)
      const outcome = outcomeOf(bounties, completedByDay.get(day) ?? new Set(), day)
      let status: WeekDayStatus
      if (day > today) status = 'future'
      else if (day === today) status = outcome === 'fulfilled' ? 'today-done' : 'today'
      else status = outcome === 'fulfilled' ? 'done' : outcome === 'failed' ? 'missed' : 'rest'
      return { day, label, name: WEEK_NAMES[index], status }
    })
  })
}

export type WeekDay = Awaited<ReturnType<typeof getWeek>>[number]

/** Bounties activas hoy, con su estado y el XP que darían ahora mismo. */
export async function getTodayBounties(db: GameDatabase, today: GameDay) {
  return db.transaction('r', gameTables(db), async () => {
    const player = await projectPlayer(db, today)
    const completed = await completedTaskIdsOn(db, today)
    const bounties = await db.bounties.toArray()

    return bounties
      .filter((bounty) => isActiveOn(bounty, today))
      .sort(byCreation)
      .map((bounty) => ({
        ...bounty,
        doneToday: completed.has(bounty.id),
        xp: bountyXp(bounty.difficulty, player.streak),
        // Los objetivos marcados otro día de juego ya no cuentan.
        stepsDoneToday: bounty.stepsDone?.day === today ? bounty.stepsDone.done.length : 0,
      }))
  })
}

export type TodayBounty = Awaited<ReturnType<typeof getTodayBounties>>[number]

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
function buildCampaignView(campaign: Campaign, campaignQuests: SideQuest[]) {
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

export type TaskRef = { kind: 'bounty' | 'sideQuest' | 'daily'; id: string }

function pathOf(skills: Map<string, Skill>, skillId: string | undefined): string | null {
  const names: string[] = []
  let id = skillId ?? null
  while (id && names.length < 6) {
    const skill = skills.get(id)
    if (!skill) break
    names.unshift(skill.name)
    id = skill.parentId
  }
  return names.length > 0 ? names.join(' › ') : null
}

async function skillMap(db: GameDatabase): Promise<Map<string, Skill>> {
  return new Map((await db.skills.toArray()).map((skill) => [skill.id, skill]))
}

async function evidenceOf(db: GameDatabase, taskId: string): Promise<Evidence[]> {
  return (await db.evidence.where('taskId').equals(taskId).toArray()).sort(byCreation)
}

/** Todo lo que muestra la vista de detalle de una misión. `null` si ya no existe. */
export async function getTaskDetail(db: GameDatabase, ref: TaskRef, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const skills = await skillMap(db)
    const shared = {
      campaign: null as string | null,
      actLabel: null as string | null,
      lock: null as string | null,
      boss: false,
      skipped: false,
      canSkip: false,
      evidence: await evidenceOf(db, ref.id),
    }

    if (ref.kind === 'bounty') {
      const task = await db.bounties.get(ref.id)
      if (!task) return null
      const player = await projectPlayer(db, today)
      return {
        ...shared,
        kind: 'bounty' as const,
        task,
        done: (await db.xpEvents.get({ taskId: ref.id, day: today })) !== undefined,
        xp: bountyXp(task.difficulty, player.streak),
        completions: await db.xpEvents.where('taskId').equals(ref.id).count(),
        stepsDone: task.stepsDone?.day === today ? task.stepsDone.done : [],
        skill: pathOf(skills, task.skillId),
      }
    }

    if (ref.kind === 'daily') {
      const task = await db.dailies.get(ref.id)
      if (!task) return null
      const campaign = task.campaignId ? ((await db.campaigns.get(task.campaignId))?.title ?? null) : null
      return {
        ...shared,
        kind: 'daily' as const,
        task,
        campaign,
        // Una misión del día caducada ya no se puede completar.
        lock: task.completedDay === null && task.id !== today ? 'Esta misión del día ya caducó' : null,
        done: task.completedDay !== null,
        xp: dailyXp(task.difficulty),
        completions: task.completedDay ? 1 : 0,
        stepsDone: task.stepsDone ?? [],
        skill: pathOf(skills, task.skillId),
      }
    }

    const task = await db.sideQuests.get(ref.id)
    if (!task) return null
    const campaign = task.campaignId ? await db.campaigns.get(task.campaignId) : undefined
    const view = campaign
      ? buildCampaignView(campaign, await db.sideQuests.where('campaignId').equals(campaign.id).toArray())
      : null
    const act = view?.actViews.find((candidate) => candidate.quests.some((quest) => quest.id === task.id))
    const lock = act?.quests.find((quest) => quest.id === task.id)?.lock ?? null
    const skipped = (task.skippedDay ?? null) !== null
    return {
      ...shared,
      kind: 'sideQuest' as const,
      task,
      campaign: campaign?.title ?? null,
      actLabel: view && !view.legacy && act ? `Acto ${act.number}` : null,
      lock,
      boss: task.boss === true,
      skipped,
      canSkip: !task.boss && lock === null && task.completedDay === null && !skipped,
      done: task.completedDay !== null,
      xp: questXp(task),
      completions: task.completedDay ? 1 : 0,
      stepsDone: task.stepsDone ?? [],
      skill: pathOf(skills, task.skillId),
    }
  })
}

export type TaskDetailView = NonNullable<Awaited<ReturnType<typeof getTaskDetail>>>

// --- Bounties -------------------------------------------------------------

export async function createBounty(
  db: GameDatabase,
  input: TaskInput & { campaignId?: string },
  now = new Date(),
): Promise<Bounty> {
  const bounty: Bounty = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now.getTime(),
    createdDay: gameDayOf(now),
    archivedDay: null,
  }
  await db.bounties.add(bounty)
  return bounty
}

/** Cambiar la dificultad no altera el XP ya ganado. */
export async function updateBounty(
  db: GameDatabase,
  id: string,
  changes: TaskChanges,
): Promise<void> {
  // Si cambian los objetivos, las casillas marcadas ya no corresponden.
  await db.bounties.update(id, changes.steps ? { ...changes, stepsDone: undefined } : changes)
}

/** Archivar conserva el historial y el XP; la Bounty deja de contar desde hoy. */
export async function archiveBounty(db: GameDatabase, id: string, now = new Date()): Promise<void> {
  await db.bounties.update(id, { archivedDay: gameDayOf(now) })
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeBounty(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<number | null> {
  const today = gameDayOf(now)

  return db.transaction('rw', gameTables(db), async () => {
    const player = await settleClosedDays(db, today)
    const bounty = await db.bounties.get(id)
    if (!bounty || !isActiveOn(bounty, today)) return null

    const alreadyCompleted = await db.xpEvents.get({ taskId: id, day: today })
    if (alreadyCompleted) return null

    const xp = bountyXp(bounty.difficulty, player.streak)
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'bounty',
      taskId: id,
      day: today,
      xp,
      ...(bounty.skillId ? { skillId: bounty.skillId } : {}),
    })
    const stepCount = bounty.steps?.length ?? 0
    if (stepCount > 0) await db.bounties.update(id, { stepsDone: { day: today, done: allSteps(stepCount) } })
    return xp
  })
}

/** Solo se puede deshacer el día en curso: los días cerrados ya contaron para la racha. */
export async function undoBounty(db: GameDatabase, id: string, now = new Date()): Promise<boolean> {
  return db.transaction('rw', db.bounties, db.xpEvents, async () => {
    const event = await db.xpEvents.get({ taskId: id, day: gameDayOf(now) })
    if (!event) return false

    await db.xpEvents.delete(event.id)
    await db.bounties.update(id, { stepsDone: undefined })
    return true
  })
}

// --- Habilidades ------------------------------------------------------------

/**
 * Busca o crea habilidades comparando nombres sin acentos ni mayúsculas,
 * para que la IA no duplique una rama por escribirla distinto.
 */
async function skillResolver(db: GameDatabase, origin: string, now: Date) {
  const all = await db.skills.toArray()
  let created = 0

  async function ensure(name: string, parentId: string | null): Promise<Skill> {
    const clean = name.trim().slice(0, MAX_SKILL_NAME)
    const existing = all.find((skill) => skill.parentId === parentId && skillKey(skill.name) === skillKey(clean))
    if (existing) return existing
    const skill: Skill = {
      id: crypto.randomUUID(),
      name: clean,
      parentId,
      createdAt: now.getTime() + created++,
      origin,
    }
    await db.skills.add(skill)
    all.push(skill)
    return skill
  }

  /** Sub-rama dentro de `branchId`; si el nombre está vacío o repite el de la rama, es la rama misma. */
  async function leaf(branchId: string | undefined, name: string | undefined): Promise<string | undefined> {
    if (!branchId) return undefined
    const branch = all.find((skill) => skill.id === branchId)
    if (!branch) return undefined
    // La IA a veces escribe la ruta completa ("Guitarra › Ritmo"): se usa el último tramo.
    const last = (name ?? '').split(/[›>/]/).pop()?.trim() ?? ''
    if (!skillKey(last) || skillKey(last) === skillKey(branch.name)) return branchId
    return (await ensure(last, branchId)).id
  }

  return { ensure, leaf }
}

/** Quita las habilidades que ya nadie usa y que nunca dieron XP. */
async function pruneSkills(db: GameDatabase): Promise<void> {
  const skills = await db.skills.toArray()
  const used = new Set<string>()
  for (const event of await db.xpEvents.toArray()) if (event.skillId) used.add(event.skillId)
  for (const quest of await db.sideQuests.toArray()) if (quest.skillId) used.add(quest.skillId)
  for (const bounty of await db.bounties.toArray()) if (bounty.skillId) used.add(bounty.skillId)
  for (const daily of await db.dailies.toArray()) if (daily.skillId) used.add(daily.skillId)
  const branches = new Set<string>()
  for (const campaign of await db.campaigns.toArray()) {
    if (!campaign.skillId) continue
    used.add(campaign.skillId)
    branches.add(campaign.skillId)
  }
  // Las sub-ramas de una campaña que sigue viva se conservan aunque todavía no tengan XP ni misiones.
  for (const skill of skills) if (skill.parentId && branches.has(skill.parentId)) used.add(skill.id)

  // Un padre se conserva si algún descendiente se conserva.
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  const keep = new Set<string>()
  for (const id of used) {
    let current = byId.get(id)
    while (current && !keep.has(current.id)) {
      keep.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
  await db.skills.bulkDelete(skills.filter((skill) => !keep.has(skill.id)).map((skill) => skill.id))
}

/** Árbol completo: el XP de cada rama es el suyo más el de sus sub-ramas. */
export async function getSkillTree(db: GameDatabase) {
  return db.transaction('r', db.skills, db.xpEvents, async () => {
    const skills = (await db.skills.toArray()).sort(byCreation)
    const own = new Map<string, number>()
    for (const event of await db.xpEvents.toArray()) {
      if (event.skillId) own.set(event.skillId, (own.get(event.skillId) ?? 0) + event.xp)
    }

    const children = new Map<string | null, Skill[]>()
    for (const skill of skills) {
      // Una habilidad cuyo padre ya no existe cuelga de la raíz.
      const parentId = skill.parentId && skills.some((other) => other.id === skill.parentId) ? skill.parentId : null
      children.set(parentId, [...(children.get(parentId) ?? []), skill])
    }

    const nodes: Array<{ id: string; name: string; parentId: string | null; origin?: string; xp: number; depth: number }> = []
    const visit = (skill: Skill, parentId: string | null, depth: number): number => {
      const node = { id: skill.id, name: skill.name, parentId, origin: skill.origin, xp: 0, depth }
      nodes.push(node)
      const below = (children.get(skill.id) ?? []).reduce((sum, child) => sum + visit(child, skill.id, depth + 1), 0)
      node.xp = (own.get(skill.id) ?? 0) + below
      return node.xp
    }
    const totalXp = (children.get(null) ?? []).reduce((sum, skill) => sum + visit(skill, null, 1), 0)

    return { nodes, totalXp }
  })
}

export type SkillTree = Awaited<ReturnType<typeof getSkillTree>>
export type SkillNode = SkillTree['nodes'][number]

/** Misiones que alimentaron una habilidad (incluidas sus sub-ramas). */
export async function getSkillDetail(db: GameDatabase, skillId: string) {
  return db.transaction('r', allTables(db), async () => {
    const skills = await skillMap(db)
    const skill = skills.get(skillId)
    if (!skill) return null

    const subtree = new Set<string>([skillId])
    let grew = true
    while (grew) {
      grew = false
      for (const other of skills.values()) {
        if (other.parentId && subtree.has(other.parentId) && !subtree.has(other.id)) {
          subtree.add(other.id)
          grew = true
        }
      }
    }

    const events = (await db.xpEvents.toArray()).filter((event) => event.skillId && subtree.has(event.skillId))
    const byTask = new Map<string, { title: string; kind: string; xp: number; times: number }>()
    for (const event of events) {
      let entry = byTask.get(event.taskId)
      if (!entry) {
        const task =
          event.kind === 'bounty'
            ? await db.bounties.get(event.taskId)
            : event.kind === 'daily'
              ? await db.dailies.get(event.taskId)
              : await db.sideQuests.get(event.taskId)
        const kind = event.kind === 'bounty' ? 'Contrato diario' : event.kind === 'daily' ? 'Misión del día' : 'Misión'
        entry = { title: task?.title ?? 'Misión borrada', kind, xp: 0, times: 0 }
        byTask.set(event.taskId, entry)
      }
      entry.xp += event.xp
      entry.times += 1
    }

    return {
      skill,
      path: pathOf(skills, skillId) ?? skill.name,
      xp: events.reduce((sum, event) => sum + event.xp, 0),
      missions: [...byTask.values()].sort((a, b) => b.xp - a.xp),
    }
  })
}

export type SkillDetail = NonNullable<Awaited<ReturnType<typeof getSkillDetail>>>

// --- Campañas ---------------------------------------------------------------

export async function createCampaign(
  db: GameDatabase,
  title: string,
  now = new Date(),
): Promise<Campaign> {
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
      [db.campaigns, db.sideQuests, db.xpEvents, db.skills, db.evidence, db.dailies, db.player].map((table) =>
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

// --- Side Quests ------------------------------------------------------------

async function addQuest(
  db: GameDatabase,
  fields: Omit<SideQuest, 'id' | 'completedDay'>,
): Promise<SideQuest> {
  const sideQuest: SideQuest = { id: crypto.randomUUID(), completedDay: null, ...fields }
  await db.sideQuests.add(sideQuest)
  return sideQuest
}

export async function createSideQuest(
  db: GameDatabase,
  input: TaskInput & { campaignId?: string | null },
  now = new Date(),
): Promise<SideQuest> {
  return db.transaction('rw', db.campaigns, db.sideQuests, async () => {
    const campaignId = input.campaignId ?? null
    let actId: string | undefined

    // En una campaña con actos, la misión manual entra al acto en curso (o al último si ya terminó).
    const campaign = campaignId ? await db.campaigns.get(campaignId) : undefined
    if (campaign?.acts?.length) {
      const quests = await db.sideQuests.where('campaignId').equals(campaign.id).toArray()
      const index = campaignState(campaign.acts, quests).currentIndex ?? campaign.acts.length - 1
      actId = campaign.acts[index].id
      // Agregar a mano una misión a un acto sin generar lo deja listo: sirve cuando no hay IA.
      if (campaign.acts[index].status === 'planned') {
        await db.campaigns.update(campaign.id, {
          acts: campaign.acts.map((act, position) =>
            position === index ? { ...act, status: 'ready' as const, readyDay: gameDayOf(now) } : act,
          ),
        })
      }
    }

    return addQuest(db, {
      title: input.title,
      difficulty: input.difficulty,
      description: input.description,
      steps: input.steps,
      ...(input.estimate ? { estimate: input.estimate } : {}),
      ...(input.why ? { why: input.why } : {}),
      ...(input.tip ? { tip: input.tip } : {}),
      ...(input.skillId ? { skillId: input.skillId } : {}),
      ...(actId ? { actId } : {}),
      campaignId,
      createdAt: now.getTime(),
      createdDay: gameDayOf(now),
    })
  })
}

export async function updateSideQuest(
  db: GameDatabase,
  id: string,
  changes: TaskChanges,
): Promise<void> {
  await db.transaction('rw', db.sideQuests, async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest) return
    // Si cambian los objetivos, las casillas se ajustan: todas si ya estaba completada, ninguna si no.
    const stepsChanged = changes.steps && JSON.stringify(changes.steps) !== JSON.stringify(quest.steps ?? [])
    await db.sideQuests.update(
      id,
      stepsChanged
        ? { ...changes, stepsDone: quest.completedDay ? allSteps(changes.steps!.length) : [] }
        : changes,
    )
  })
}

/** Borra la Side Quest y sus evidencias. El XP ya ganado se conserva; para quitarlo, primero se deshace. */
export async function deleteSideQuest(db: GameDatabase, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    await db.evidence.where('taskId').equals(id).delete()
    await db.sideQuests.delete(id)
    await pruneSkills(db)
  })
}

/** Estado de la campaña de una misión, para saber si está bloqueada o si cierra un acto. */
async function campaignContext(db: GameDatabase, quest: SideQuest) {
  if (!quest.campaignId) return null
  const campaign = await db.campaigns.get(quest.campaignId)
  if (!campaign) return null
  const quests = await db.sideQuests.where('campaignId').equals(campaign.id).toArray()
  return { campaign, state: campaignState(campaign.acts, quests) }
}

/** Si entre `before` y ahora se cerró el acto de la misión, describe qué sigue. */
async function actCompletion(
  db: GameDatabase,
  quest: SideQuest,
  before: NonNullable<Awaited<ReturnType<typeof campaignContext>>>,
): Promise<ActCompletion | undefined> {
  const acts = before.campaign.acts
  if (!acts?.length) return undefined
  const after = await campaignContext(db, quest)
  if (!after) return undefined
  const index = Math.max(0, acts.findIndex((act) => act.id === quest.actId))
  if (before.state.states[index] === 'done' || after.state.states[index] !== 'done') return undefined

  const next = acts[index + 1]
  return {
    campaignId: before.campaign.id,
    campaignTitle: before.campaign.title,
    actNumber: index + 1,
    actTitle: acts[index].title,
    next: next ? { number: index + 2, title: next.title, planned: next.status === 'planned' } : null,
  }
}

/** Completa una Side Quest respetando el bloqueo de actos y la evidencia de la misión jefe. */
export async function completeQuest(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest || quest.completedDay !== null) return FAILED

    const before = await campaignContext(db, quest)
    if (before?.state.locks.get(id)) return { ...FAILED, blocked: 'locked' as const }
    if (quest.boss && (await db.evidence.where('taskId').equals(id).count()) === 0) {
      return { ...FAILED, blocked: 'evidence' as const, boss: true }
    }

    const xp = questXp(quest)
    await db.sideQuests.update(id, {
      completedDay: today,
      skippedDay: null,
      stepsDone: allSteps(quest.steps?.length ?? 0),
    })
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'sideQuest',
      taskId: id,
      day: today,
      xp,
      ...(quest.skillId ? { skillId: quest.skillId } : {}),
    })

    return { ok: true, xp, boss: quest.boss === true, act: before ? await actCompletion(db, quest, before) : undefined }
  })
}

/** Devuelve el XP ganado, o `null` si no se pudo completar. */
export async function completeSideQuest(
  db: GameDatabase,
  id: string,
  now = new Date(),
): Promise<number | null> {
  const outcome = await completeQuest(db, id, now)
  return outcome.ok ? outcome.xp : null
}

/** "Ya sé hacer esto": la misión cuenta para avanzar, pero no da XP ni crea evento. */
export async function skipSideQuest(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  return db.transaction('rw', allTables(db), async () => {
    const quest = await db.sideQuests.get(id)
    if (!quest || quest.boss || isResolved(quest)) return FAILED

    const before = await campaignContext(db, quest)
    if (before?.state.locks.get(id)) return { ...FAILED, blocked: 'locked' as const }

    await db.sideQuests.update(id, { skippedDay: gameDayOf(now) })
    return { ok: true, xp: 0, act: before ? await actCompletion(db, quest, before) : undefined }
  })
}

/**
 * Deshace una misión completada o saltada. Quita su XP (si lo dio) y, como el bloqueo se
 * deriva de las misiones, lo que dependía de ella vuelve a quedar bloqueado.
 */
export async function undoSideQuest(db: GameDatabase, id: string): Promise<boolean> {
  return db.transaction('rw', db.sideQuests, db.xpEvents, async () => {
    const sideQuest = await db.sideQuests.get(id)
    if (!sideQuest || !isResolved(sideQuest)) return false

    const wasCompleted = sideQuest.completedDay !== null
    await db.sideQuests.update(id, {
      completedDay: null,
      skippedDay: null,
      stepsDone: [],
      ...(wasCompleted ? { undoCount: (sideQuest.undoCount ?? 0) + 1 } : {}),
    })
    await db.xpEvents.where('taskId').equals(id).delete()
    return true
  })
}

// --- Objetivos marcables ------------------------------------------------------

function toggled(done: number[], index: number): number[] {
  return done.includes(index) ? done.filter((value) => value !== index) : [...done, index].sort((a, b) => a - b)
}

/**
 * Marca o desmarca un objetivo. Al marcar el último, la misión se completa sola;
 * al desmarcar uno de una misión completada, se deshace.
 */
export async function toggleStep(db: GameDatabase, ref: TaskRef, index: number, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    if (ref.kind === 'bounty') {
      const bounty = await db.bounties.get(ref.id)
      const count = bounty?.steps?.length ?? 0
      if (!bounty || index < 0 || index >= count || !isActiveOn(bounty, today)) return FAILED
      const done = toggled(bounty.stepsDone?.day === today ? bounty.stepsDone.done : [], index)
      const completedToday = (await db.xpEvents.get({ taskId: ref.id, day: today })) !== undefined

      if (completedToday && done.length < count) await undoBounty(db, ref.id, now)
      await db.bounties.update(ref.id, { stepsDone: { day: today, done } })
      if (!completedToday && done.length === count) {
        const xp = await completeBounty(db, ref.id, now)
        return xp === null ? FAILED : { ok: true, xp }
      }
      return { ok: true, xp: 0 }
    }

    if (ref.kind === 'daily') {
      const daily = await db.dailies.get(ref.id)
      const count = daily?.steps?.length ?? 0
      if (!daily || index < 0 || index >= count || daily.id !== today) return FAILED
      const done = toggled(daily.stepsDone ?? [], index)

      if (daily.completedDay !== null && done.length < count) await undoDaily(db, ref.id)
      await db.dailies.update(ref.id, { stepsDone: done })
      if (daily.completedDay === null && done.length === count) return completeDaily(db, ref.id, now)
      return { ok: true, xp: 0 }
    }

    const quest = await db.sideQuests.get(ref.id)
    const count = quest?.steps?.length ?? 0
    if (!quest || index < 0 || index >= count) return FAILED
    const context = await campaignContext(db, quest)
    if (context?.state.locks.get(ref.id)) return { ...FAILED, blocked: 'locked' as const }
    const done = toggled(quest.stepsDone ?? [], index)

    if (quest.completedDay !== null && done.length < count) await undoSideQuest(db, ref.id)
    await db.sideQuests.update(ref.id, { stepsDone: done })
    if (quest.completedDay === null && done.length === count) {
      const outcome = await completeQuest(db, ref.id, now)
      // Si el jefe aún pide evidencia, las casillas quedan marcadas y se completa al agregarla.
      return outcome.ok || outcome.blocked ? outcome : { ok: true, xp: 0 }
    }
    return { ok: true, xp: 0 }
  })
}

// --- Bitácora de evidencias ---------------------------------------------------

async function taskTitle(db: GameDatabase, ref: TaskRef): Promise<string | null> {
  const task =
    ref.kind === 'bounty'
      ? await db.bounties.get(ref.id)
      : ref.kind === 'daily'
        ? await db.dailies.get(ref.id)
        : await db.sideQuests.get(ref.id)
  return task?.title ?? null
}

/** Agrega una foto (data URL ya comprimida) o una nota. Devuelve `null` si se alcanzó el límite. */
export async function addEvidence(
  db: GameDatabase,
  ref: TaskRef,
  content: { photo: string } | { note: string },
  now = new Date(),
): Promise<Evidence | null> {
  return db.transaction('rw', allTables(db), async () => {
    const title = await taskTitle(db, ref)
    if (title === null) return null
    const existing = await db.evidence.where('taskId').equals(ref.id).toArray()

    const isPhoto = 'photo' in content
    const note = isPhoto ? '' : content.note.trim().slice(0, MAX_NOTE_LENGTH)
    if (isPhoto && existing.filter((item) => item.photo).length >= MAX_PHOTOS_PER_TASK) return null
    if (!isPhoto && (!note || existing.filter((item) => item.note).length >= MAX_NOTES_PER_TASK)) return null

    const evidence: Evidence = {
      id: crypto.randomUUID(),
      taskKind: ref.kind,
      taskId: ref.id,
      taskTitle: title,
      createdAt: now.getTime(),
      day: gameDayOf(now),
      ...(isPhoto ? { photo: content.photo } : { note }),
    }
    await db.evidence.add(evidence)
    return evidence
  })
}

export async function deleteEvidence(db: GameDatabase, id: string): Promise<void> {
  await db.evidence.delete(id)
}

/** Todas las evidencias, de la más reciente a la más antigua, con su campaña si la tienen. */
export async function getJournal(db: GameDatabase) {
  return db.transaction('r', db.evidence, db.sideQuests, db.campaigns, async () => {
    const entries = (await db.evidence.toArray()).sort((a, b) => b.createdAt - a.createdAt)
    const campaigns = new Map((await db.campaigns.toArray()).map((campaign) => [campaign.id, campaign.title]))
    const quests = new Map((await db.sideQuests.toArray()).map((quest) => [quest.id, quest]))

    return entries.map((entry) => {
      const quest = quests.get(entry.taskId)
      return {
        ...entry,
        boss: quest?.boss === true,
        campaign: quest?.campaignId ? (campaigns.get(quest.campaignId) ?? null) : null,
      }
    })
  })
}

export type JournalEntry = Awaited<ReturnType<typeof getJournal>>[number]

// --- Misión del día -----------------------------------------------------------

/** La misión del día de hoy, o `null`. Las de días anteriores ya caducaron. */
export async function getDaily(db: GameDatabase, today: GameDay) {
  const daily = await db.dailies.get(today)
  if (!daily) return null
  return { ...daily, done: daily.completedDay !== null, xp: dailyXp(daily.difficulty) }
}

export type DailyView = NonNullable<Awaited<ReturnType<typeof getDaily>>>

/** Material para pedirle a la IA la misión del día, o `null` si no hay de dónde sacarla. */
export async function getDailyContext(db: GameDatabase, today: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const missions = await getMissions(db)
    const active = missions.campaigns.filter((campaign) => campaign.currentAct !== null)
    const skills = await skillMap(db)
    const parents = new Set([...skills.values()].map((skill) => skill.parentId))
    const leaves = [...skills.values()].filter((skill) => !parents.has(skill.id)).sort(byCreation)

    if (active.length > 0) {
      // Se rota entre campañas según el día, para que no siempre toque la misma.
      const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000)
      const campaign = active[dayNumber % active.length]
      const act = campaign.actViews[campaign.currentAct! - 1]
      const branchLeaves = leaves.filter((skill) => skill.parentId === campaign.skillId)
      return {
        campaignId: campaign.id as string | null,
        campaign: campaign.title as string | null,
        act: campaign.legacy ? null : { number: act.number, title: act.title, goal: act.goal },
        pending: act.quests.filter((quest) => !isResolved(quest) && !quest.boss).map((quest) => quest.title).slice(0, 6),
        branchId: campaign.skillId ?? null,
        skills: branchLeaves.map((skill) => skill.name),
      }
    }
    if (leaves.length === 0) return null
    return {
      campaignId: null,
      campaign: null,
      act: null,
      pending: [] as string[],
      branchId: null as string | null,
      skills: leaves.slice(0, 12).map((skill) => pathOf(skills, skill.id)!),
    }
  })
}

export type DailyContext = NonNullable<Awaited<ReturnType<typeof getDailyContext>>>

/** Guarda la misión del día. Si ya había una para ese día, se conserva la que estaba. */
export async function saveDaily(
  db: GameDatabase,
  input: TaskInput & { skill?: string; campaignId?: string | null; branchId?: string | null },
  now = new Date(),
): Promise<Daily> {
  const today = gameDayOf(now)

  return db.transaction('rw', allTables(db), async () => {
    const existing = await db.dailies.get(today)
    if (existing) return existing

    // Las misiones del día sin completar de días anteriores ya caducaron.
    const expired = (await db.dailies.toArray()).filter((daily) => daily.completedDay === null)
    await db.evidence.where('taskId').anyOf(expired.map((daily) => daily.id)).delete()
    await db.dailies.bulkDelete(expired.map((daily) => daily.id))

    const { skill, campaignId, branchId, ...fields } = input
    let skillId: string | undefined
    if (branchId) {
      skillId = await (await skillResolver(db, 'Misión del día', now)).leaf(branchId, skill)
    } else if (skill) {
      // Sin campaña: solo se enlaza si coincide con una habilidad que ya existe.
      const all = await db.skills.toArray()
      const last = skill.split(/[›>/]/).pop() ?? ''
      skillId = all.find((candidate) => skillKey(candidate.name) === skillKey(last))?.id
    }

    const daily: Daily = {
      id: today,
      ...fields,
      ...(skillId ? { skillId } : {}),
      ...(campaignId ? { campaignId } : {}),
      createdAt: now.getTime(),
      createdDay: today,
      completedDay: null,
    }
    await db.dailies.add(daily)
    return daily
  })
}

/** Da XP extra y suma a su habilidad. No toca la racha: el evento no es de un contrato. */
export async function completeDaily(db: GameDatabase, id: string, now = new Date()): Promise<Outcome> {
  const today = gameDayOf(now)

  return db.transaction('rw', db.dailies, db.xpEvents, async () => {
    const daily = await db.dailies.get(id)
    if (!daily || daily.completedDay !== null) return FAILED
    if (daily.id !== today) return { ...FAILED, blocked: 'locked' as const }

    const xp = dailyXp(daily.difficulty)
    await db.dailies.update(id, { completedDay: today, stepsDone: allSteps(daily.steps?.length ?? 0) })
    await db.xpEvents.add({
      id: crypto.randomUUID(),
      kind: 'daily',
      taskId: id,
      day: today,
      xp,
      ...(daily.skillId ? { skillId: daily.skillId } : {}),
    })
    return { ok: true, xp }
  })
}

export async function undoDaily(db: GameDatabase, id: string): Promise<boolean> {
  return db.transaction('rw', db.dailies, db.xpEvents, async () => {
    const daily = await db.dailies.get(id)
    if (!daily || daily.completedDay === null) return false

    await db.dailies.update(id, { completedDay: null, stepsDone: [] })
    await db.xpEvents.where('taskId').equals(id).delete()
    return true
  })
}
