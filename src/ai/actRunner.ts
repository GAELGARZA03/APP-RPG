import { useSyncExternalStore } from 'react'
import { db } from '../data/appDb'
import { addActMissions, getActReport } from '../data/gameStore'
import { httpRequest } from '../platform/http'
import { AiError, generateAct, type ActBrief } from './gemini'
import { aiSession } from './session'

export type ActRunState =
  | { status: 'running'; fast: boolean }
  | { status: 'error'; message: string; offerFast: boolean; noKey?: boolean }

/**
 * Estado de la generación de actos, fuera de React: así sobrevive a cerrar el mapa
 * y un doble toque no lanza dos generaciones de la misma campaña.
 */
const states = new Map<string, ActRunState>()
const listeners = new Set<() => void>()

function setState(campaignId: string, state: ActRunState | null) {
  if (state) states.set(campaignId, state)
  else states.delete(campaignId)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useActRun(campaignId: string): ActRunState | undefined {
  return useSyncExternalStore(subscribe, () => states.get(campaignId))
}

/**
 * Genera las misiones del acto actual (si sigue pendiente) con el modelo principal.
 * `fast` solo se usa cuando el jugador lo pide tras un error: nunca se cambia de modelo en silencio.
 * Devuelve `true` si el acto quedó listo.
 */
export async function generateNextAct(campaignId: string, fast = false): Promise<boolean> {
  if (states.get(campaignId)?.status === 'running') return false
  setState(campaignId, { status: 'running', fast })

  try {
    const session = await aiSession()
    if (!session) {
      setState(campaignId, {
        status: 'error',
        message: 'Guarda tu API key de Gemini en Ajustes para generar el acto, o agrega misiones a mano.',
        offerFast: false,
        noKey: true,
      })
      return false
    }
    const report = await getActReport(db, campaignId)
    if (!report) {
      // El acto ya no está pendiente (otra generación terminó o la campaña cambió).
      setState(campaignId, null)
      return false
    }

    const brief: ActBrief = {
      campaign: report.view.title,
      idea: report.view.brief?.idea ?? '',
      answers: report.view.brief?.answers ?? [],
      diagnosis: report.view.analysis?.diagnosis ?? '',
      successCriteria: report.view.analysis?.successCriteria ?? '',
      acts: report.view.actViews.map(({ number, title, goal, difficulty }) => ({ number, title, goal, difficulty })),
      nextAct: report.next.number,
      previous: report.previous,
      boss: report.boss?.title ?? null,
      skills: await skillNames(report.view.skillId),
    }
    const missions = await generateAct(httpRequest, {
      apiKey: session.apiKey,
      model: fast ? session.fastModel : session.mainModel,
      thinking: fast ? undefined : 'medium',
      brief,
    })
    // Si mientras tanto el acto dejó de estar pendiente, no se guarda nada.
    const saved = await addActMissions(db, campaignId, report.next.id, missions)
    setState(campaignId, null)
    return saved
  } catch (error) {
    const aiError = error instanceof AiError ? error : null
    setState(campaignId, {
      status: 'error',
      message: aiError?.message ?? 'No se pudo generar el acto.',
      offerFast: !fast && Boolean(aiError?.modelRelated),
    })
    return false
  }
}

async function skillNames(branchId: string | undefined): Promise<string[]> {
  if (!branchId) return []
  return (await db.skills.where('parentId').equals(branchId).toArray())
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((skill) => skill.name)
}

/** Solo para pruebas. */
export function resetActRuns() {
  states.clear()
}
