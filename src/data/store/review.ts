// Revisión semanal: resume la semana de juego para la IA, guarda la revisión y aplica sus ajustes.
import { addDays, type GameDay } from '../../game/gameDay'
import { isResolved, nextStreak, type DayOutcome, type Difficulty } from '../../game/rules'
import type { GameDatabase, ReviewAdjustment, SideQuest, WeeklyReview } from '../db'
import { archiveHabit, createHabit } from './habits'
import { buildCampaignView } from './campaigns'
import { addQuest, deleteSideQuest, updateSideQuest } from './quests'
import { allTables, byCreation, isScheduledOn, outcomeOf, pathOf, skillMap } from './shared'

/** Una misión pendiente lleva atascada si sigue sin hacerse tantos días después de desbloquearse. */
export const STUCK_AFTER_DAYS = 5
const MAX_LISTED = 12

/** Lunes de la semana de juego de `day`. */
export function weekStartOf(day: GameDay): GameDay {
  const [year, month, date] = day.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

function daysBetween(from: GameDay, to: GameDay): number {
  const toTime = (day: GameDay) => Date.UTC(...(day.split('-').map(Number) as [number, number, number]))
  return Math.round((toTime(to) - toTime(from)) / 86_400_000)
}

/** Referencia corta que ve la IA (m1, c1…) y a qué apunta de verdad. */
export type ReviewRef = { kind: 'sideQuest' | 'habit'; id: string; title: string; resolved: boolean }

/** Todo lo que la IA necesita saber de la semana. Solo datos del juego, nada más personal. */
export async function getWeekReport(db: GameDatabase, weekStart: GameDay) {
  return db.transaction('r', allTables(db), async () => {
    const weekEnd = addDays(weekStart, 6)
    const inWeek = (day: GameDay | null | undefined) => !!day && day >= weekStart && day <= weekEnd
    const [campaigns, quests, habits, events, dailies, evidence, skills, habitLogs] = await Promise.all([
      db.campaigns.toArray(),
      db.sideQuests.toArray(),
      db.habits.toArray(),
      db.xpEvents.toArray(),
      db.dailies.toArray(),
      db.evidence.toArray(),
      skillMap(db),
      db.habitLogs.where('day').between(weekStart, addDays(weekEnd, 1)).toArray(),
    ])
    campaigns.sort(byCreation)
    quests.sort(byCreation)
    habits.sort((a, b) => a.order - b.order)

    const refs: Record<string, ReviewRef> = {}
    const refOf = new Map<string, string>()
    const ref = (kind: ReviewRef['kind'], item: { id: string; title: string }, resolved = false) => {
      const known = refOf.get(item.id)
      if (known) return known
      const key = `${kind === 'sideQuest' ? 'm' : 'c'}${Object.values(refs).filter((entry) => entry.kind === kind).length + 1}`
      refs[key] = { kind, id: item.id, title: item.title, resolved }
      refOf.set(item.id, key)
      return key
    }

    const campaignTitle = new Map(campaigns.map((campaign) => [campaign.id, campaign.title]))
    const skillName = (skillId: string | undefined) => pathOf(skills, skillId)?.split(' › ').at(-1) ?? null

    // Campañas, actos cerrados en la semana y misiones atascadas.
    const campaignLines = []
    const stuck = []
    const open = []
    const actTitle = new Map<string, string>()
    for (const campaign of campaigns) {
      const campaignQuests = quests.filter((quest) => quest.campaignId === campaign.id)
      const view = buildCampaignView(campaign, campaignQuests)
      const closedThisWeek: string[] = []
      let previousActDone: GameDay | null = null
      for (const act of view.actViews) {
        actTitle.set(act.id, view.legacy ? '' : `Acto ${act.number}: ${act.title}`)
        const doneDays = act.quests.map((quest) => quest.completedDay ?? quest.skippedDay ?? null)
        const closedOn = act.state === 'done' && doneDays.every(Boolean) ? (doneDays as GameDay[]).sort().at(-1)! : null
        if (closedOn && inWeek(closedOn) && !view.legacy) closedThisWeek.push(`Acto ${act.number}: ${act.title}`)

        if (act.state === 'current' && act.status === 'ready') {
          for (const quest of act.quests) {
            if (isResolved(quest) || quest.lock) continue
            const unlocked = [quest.createdDay, act.readyDay, previousActDone].filter(Boolean).sort().at(-1)!
            const days = daysBetween(unlocked, weekEnd)
            const item = {
              ref: ref('sideQuest', quest),
              title: quest.title,
              campaign: campaign.title,
              act: actTitle.get(act.id) ?? '',
              difficulty: quest.difficulty,
              boss: Boolean(quest.boss),
              steps: `${quest.stepsDone?.length ?? 0}/${quest.steps?.length ?? 0}`,
              undone: quest.undoCount ?? 0,
            }
            open.push(item)
            if (days >= STUCK_AFTER_DAYS) stuck.push({ ...item, days })
          }
        }
        if (closedOn) previousActDone = closedOn
      }
      if (view.currentAct !== null || closedThisWeek.length > 0) {
        campaignLines.push({
          title: campaign.title,
          progress: view.progress,
          currentAct: view.currentAct === null ? null : (actTitle.get(view.actViews[view.currentAct - 1].id) ?? null),
          actsClosed: closedThisWeek,
        })
      }
    }

    const questLine = (quest: SideQuest) => ({
      ref: ref('sideQuest', quest, true),
      title: quest.title,
      campaign: quest.campaignId ? (campaignTitle.get(quest.campaignId) ?? null) : null,
      act: quest.actId ? (actTitle.get(quest.actId) ?? null) : null,
      difficulty: quest.difficulty,
      skill: skillName(quest.skillId),
      boss: Boolean(quest.boss),
    })
    const completed = quests.filter((quest) => inWeek(quest.completedDay) && !quest.skippedDay).map(questLine)
    const skipped = quests.filter((quest) => inWeek(quest.skippedDay)).map(questLine)

    // Hábitos: registro día por día. La racha general cuenta cualquier día con XP ganado.
    const weekEvents = events.filter((event) => inWeek(event.day))
    const doneByDay = new Map<GameDay, Set<string>>()
    for (const event of events) {
      const set = doneByDay.get(event.day) ?? new Set<string>()
      set.add(event.taskId)
      doneByDay.set(event.day, set)
    }
    const logOf = new Map(habitLogs.map((log) => [`${log.habitId}:${log.day}`, log.state]))
    const mark = { done: '✓', half: '½', missed: '✗' }
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    const habitLines = habits
      .filter((habit) => days.some((day) => isScheduledOn(habit, day)))
      .map((habit) => {
        const scheduled = days.filter((day) => isScheduledOn(habit, day))
        const states = scheduled.map((day) => logOf.get(`${habit.id}:${day}`))
        return {
          ref: ref('habit', habit, habit.archivedDay !== null),
          title: habit.title,
          difficulty: habit.difficulty,
          done: states.reduce((sum, state) => sum + (state === 'done' ? 1 : state === 'half' ? 0.5 : 0), 0),
          scheduled: scheduled.length,
          days: days
            .map((day) => {
              if (!isScheduledOn(habit, day)) return '·'
              const state = logOf.get(`${habit.id}:${day}`)
              return state ? mark[state] : '?'
            })
            .join(''),
        }
      })
    const outcomes: DayOutcome[] = days.map((day) => outcomeOf(doneByDay.get(day)))
    const firstDay = events.map((event) => event.day).sort()[0]
    let streakStart = 0
    if (firstDay) {
      for (let day = firstDay; day < weekStart; day = addDays(day, 1)) {
        streakStart = nextStreak(streakStart, outcomeOf(doneByDay.get(day)))
      }
    }
    const streakEnd = outcomes.reduce(nextStreak, streakStart)

    const xpBySkill = new Map<string, number>()
    for (const event of weekEvents) {
      const name = skillName(event.skillId)
      if (name) xpBySkill.set(name, (xpBySkill.get(name) ?? 0) + event.xp)
    }
    const weekDailies = dailies.filter((daily) => inWeek(daily.day))
    const evidenceCount = evidence.filter((item) => inWeek(item.day)).length

    return {
      weekStart,
      weekEnd,
      hasActivity: weekEvents.length > 0 || skipped.length > 0 || evidenceCount > 0,
      xp: weekEvents.reduce((sum, event) => sum + event.xp, 0),
      streakStart,
      streakEnd,
      dayOutcomes: outcomes,
      campaigns: campaignLines,
      completed,
      skipped,
      undone: open.filter((item) => item.undone > 0),
      stuck: stuck.sort((a, b) => b.days - a.days).slice(0, MAX_LISTED),
      open: open.slice(0, MAX_LISTED),
      habits: habitLines,
      dailies: weekDailies.map((daily) => ({ title: daily.title, done: daily.completedDay !== null })),
      skills: [...xpBySkill].map(([name, xp]) => ({ name, xp })).sort((a, b) => b.xp - a.xp),
      evidence: evidenceCount,
      refs,
    }
  })
}

export type WeekReport = Awaited<ReturnType<typeof getWeekReport>>

/** Lo que propone la IA, con referencias cortas (m1, c1…) en vez de ids. */
export interface ReviewPlan {
  summary: string
  wins: string[]
  stuck: Array<{ ref: string; title: string; cause: string }>
  adjustments: Array<{
    kind: ReviewAdjustment['kind']
    ref: string
    reason: string
    principle?: string
    difficulty?: Difficulty
    parts?: ReviewAdjustment['parts']
    habit?: ReviewAdjustment['habit']
  }>
  focus: Array<{ ref: string; title: string; why: string }>
}

/** Convierte las referencias de la IA en ids y descarta los ajustes que no se podrían aplicar. */
export function planToReview(plan: ReviewPlan, report: WeekReport, model: string, now = new Date()): WeeklyReview {
  const target = (key: string, kind: ReviewRef['kind']) => {
    const found = report.refs[key.trim()]
    return found && found.kind === kind ? found : null
  }
  const adjustments: ReviewAdjustment[] = []
  for (const item of plan.adjustments) {
    const base = {
      id: crypto.randomUUID(),
      kind: item.kind,
      reason: item.reason,
      ...(item.principle ? { principle: item.principle } : {}),
      status: 'pending' as const,
    }
    if (item.kind === 'split' || item.kind === 'difficulty') {
      const quest = target(item.ref, 'sideQuest')
      if (!quest || quest.resolved) continue
      if (item.kind === 'split' && (item.parts?.length ?? 0) >= 2) {
        adjustments.push({ ...base, questId: quest.id, targetTitle: quest.title, parts: item.parts!.slice(0, 3) })
      } else if (item.kind === 'difficulty' && item.difficulty) {
        adjustments.push({ ...base, questId: quest.id, targetTitle: quest.title, difficulty: item.difficulty })
      }
    } else if (item.kind === 'archiveHabit') {
      const habit = target(item.ref, 'habit')
      if (habit && !habit.resolved) adjustments.push({ ...base, habitId: habit.id, targetTitle: habit.title })
    } else if (item.kind === 'addHabit' && item.habit) {
      adjustments.push({ ...base, habit: item.habit })
    }
  }

  return {
    id: report.weekStart,
    createdAt: now.getTime(),
    summary: plan.summary,
    wins: plan.wins,
    stuck: plan.stuck.map(({ title, cause }) => ({ title, cause })),
    adjustments: adjustments.slice(0, 4),
    focus: plan.focus.slice(0, 3).map(({ ref: key, title, why }) => {
      const quest = target(key, 'sideQuest')
      return { title, why, ...(quest && !quest.resolved ? { questId: quest.id } : {}) }
    }),
    model,
  }
}

export async function saveReview(db: GameDatabase, review: WeeklyReview): Promise<void> {
  await db.reviews.put(review)
}

export async function getReview(db: GameDatabase, weekStart: GameDay) {
  return (await db.reviews.get(weekStart)) ?? null
}

/** Revisiones guardadas con contenido, de la más reciente a la más antigua. */
export async function listReviews(db: GameDatabase) {
  return (await db.reviews.toArray()).filter((review) => !review.empty).sort((a, b) => b.id.localeCompare(a.id))
}

/**
 * Tarjeta de Hoy: la revisión de la semana que acaba de terminar. `null` si no hay nada que mostrar
 * (el jugador aún no existía esa semana, o la semana estaba vacía y ya lo vio).
 */
export async function getReviewCard(db: GameDatabase, today: GameDay) {
  const weekStart = addDays(weekStartOf(today), -7)
  const weekEnd = addDays(weekStart, 6)
  const review = await getReview(db, weekStart)
  if (review) {
    if (review.empty) return null
    return {
      weekStart,
      review,
      empty: false,
      pending: review.adjustments.filter((item) => item.status === 'pending').length,
    }
  }
  const existed =
    (await db.habits.filter((habit) => habit.createdDay <= weekEnd).count()) > 0 ||
    (await db.campaigns.filter((campaign) => campaign.createdDay <= weekEnd).count()) > 0
  if (!existed) return null
  const report = await getWeekReport(db, weekStart)
  return { weekStart, review: null, empty: !report.hasActivity, pending: 0 }
}

export type ReviewCardView = NonNullable<Awaited<ReturnType<typeof getReviewCard>>>

/** Marca como vista una semana sin actividad, para que la tarjeta no vuelva a salir. */
export async function dismissEmptyWeek(db: GameDatabase, weekStart: GameDay, now = new Date()): Promise<void> {
  await db.reviews.put({
    id: weekStart,
    createdAt: now.getTime(),
    empty: true,
    summary: '',
    wins: [],
    stuck: [],
    adjustments: [],
    focus: [],
  })
}

export type ApplyResult = { ok: true } | { ok: false; message: string }

/**
 * Aplica un ajuste con las funciones normales del juego. Nunca toca el XP ganado, y como las misiones
 * nuevas entran al mismo acto que la original, el bloqueo de actos no cambia.
 */
export async function applyAdjustment(
  db: GameDatabase,
  weekStart: GameDay,
  adjustmentId: string,
  now = new Date(),
): Promise<ApplyResult> {
  return db.transaction('rw', allTables(db), async () => {
    const review = await db.reviews.get(weekStart)
    const adjustment = review?.adjustments.find((item) => item.id === adjustmentId)
    if (!review || !adjustment || adjustment.status !== 'pending')
      return { ok: false, message: 'Este ajuste ya no está disponible.' }

    const fail = (message: string): ApplyResult => ({ ok: false, message })
    if (adjustment.kind === 'split' || adjustment.kind === 'difficulty') {
      const quest = adjustment.questId ? await db.sideQuests.get(adjustment.questId) : undefined
      if (!quest) return fail('La misión ya no existe.')
      if (isResolved(quest)) return fail('La misión ya está completada.')
      if (adjustment.kind === 'difficulty') {
        await updateSideQuest(db, quest.id, { difficulty: adjustment.difficulty! })
      } else {
        for (const [index, part] of (adjustment.parts ?? []).entries()) {
          await addQuest(db, {
            title: part.title,
            difficulty: part.difficulty,
            description: part.description,
            steps: part.steps,
            ...(adjustment.principle ? { principle: adjustment.principle } : {}),
            campaignId: quest.campaignId,
            ...(quest.actId ? { actId: quest.actId } : {}),
            ...(quest.skillId ? { skillId: quest.skillId } : {}),
            createdAt: now.getTime() + index,
            createdDay: quest.createdDay,
          })
        }
        await deleteSideQuest(db, quest.id)
      }
    } else if (adjustment.kind === 'archiveHabit') {
      const habit = adjustment.habitId ? await db.habits.get(adjustment.habitId) : undefined
      if (!habit || habit.archivedDay !== null) return fail('El hábito ya no está activo.')
      await archiveHabit(db, habit.id, now)
    } else if (adjustment.habit) {
      const principle = adjustment.principle ? { principle: adjustment.principle } : {}
      await createHabit(db, { ...adjustment.habit, ...principle }, now)
    }

    await setStatus(db, review, adjustmentId, 'applied')
    return { ok: true }
  })
}

export async function dismissAdjustment(db: GameDatabase, weekStart: GameDay, adjustmentId: string): Promise<void> {
  const review = await db.reviews.get(weekStart)
  if (review) await setStatus(db, review, adjustmentId, 'dismissed')
}

async function setStatus(
  db: GameDatabase,
  review: WeeklyReview,
  adjustmentId: string,
  status: ReviewAdjustment['status'],
): Promise<void> {
  await db.reviews.update(review.id, {
    adjustments: review.adjustments.map((item) => (item.id === adjustmentId ? { ...item, status } : item)),
  })
}
