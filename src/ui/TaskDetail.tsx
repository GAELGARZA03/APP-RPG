import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Flag, LoaderCircle, Pencil, Repeat, RotateCcw, Sparkles, Swords, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { detailTask, GEMINI_KEY_SECRET } from '../ai/gemini'
import { db } from '../data/appDb'
import {
  completeBounty,
  completeSideQuest,
  getTaskDetail,
  undoBounty,
  undoSideQuest,
  updateBounty,
  updateSideQuest,
  type TaskDetailView,
  type TaskRef,
} from '../data/gameStore'
import { getAiSettings } from '../data/settings'
import type { GameDay } from '../game/gameDay'
import { httpRequest } from '../platform/http'
import { getSecret } from '../platform/secrets'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { SectionLabel } from './kit/Card'
import { DifficultyPips } from './kit/controls'

const DIFFICULTY_NAMES = ['', 'Fácil', 'Normal', 'Media', 'Difícil', 'Épica']

function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
  })
}

/** Gemini escribe la descripción y los objetivos de una misión que no los tiene. */
function useAiDetail(view: TaskDetailView | null | undefined) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
  }>({ loading: false, error: null })
  const [hasKey, setHasKey] = useState(false)

  useEffect(() => {
    getSecret(GEMINI_KEY_SECRET)
      .then((key) => setHasKey(key !== null))
      .catch(() => setHasKey(false))
  }, [])

  async function run() {
    if (!view) return
    setState({ loading: true, error: null })
    try {
      const apiKey = await getSecret(GEMINI_KEY_SECRET)
      if (!apiKey) throw new Error('Guarda tu API key de Gemini en Ajustes.')
      const { model } = await getAiSettings(db)
      const detail = await detailTask(httpRequest, {
        apiKey,
        model,
        title: view.task.title,
        campaign: view.campaign,
        daily: view.kind === 'bounty',
      })
      if (view.kind === 'bounty') await updateBounty(db, view.task.id, detail)
      else await updateSideQuest(db, view.task.id, detail)
      setState({ loading: false, error: null })
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudo generar.',
      })
    }
  }

  return { ...state, hasKey, run }
}

export function TaskDetail(props: {
  taskRef: TaskRef
  initialView: TaskDetailView
  today: GameDay
  onClose: () => void
  onEdit: (view: TaskDetailView) => void
  onReward: (xp: number | null) => void
}) {
  const { taskRef, initialView, today, onClose, onEdit, onReward } = props
  const titleId = useId()
  const closeButton = useRef<HTMLButtonElement>(null)
  // `initialView` llega ya cargado, así el primer cuadro de la animación tiene todo el contenido.
  const view = useLiveQuery(() => getTaskDetail(db, taskRef, today), [taskRef.kind, taskRef.id, today], initialView)
  const ai = useAiDetail(view)
  // Al cerrar, la tarjeta se desvanece y luego se quita. No regresa a su fila: si la fila
  // ya no está (por ejemplo, tras cambiar de pestaña), esa animación nunca terminaba.
  const [closing, setClosing] = useState(false)
  const requestClose = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 180)
  }, [onClose])

  // Si la misión se borra o se archiva desde la edición, el detalle se cierra.
  useEffect(() => {
    if (view === null) onClose()
  }, [view, onClose])

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && requestClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose])

  async function toggle() {
    if (!view) return
    if (view.kind === 'bounty') {
      if (view.done) await undoBounty(db, view.task.id)
      else onReward(await completeBounty(db, view.task.id))
    } else if (view.done) await undoSideQuest(db, view.task.id)
    else onReward(await completeSideQuest(db, view.task.id))
  }

  const steps = view?.task.steps ?? []
  const description = view?.task.description ?? ''
  const hasDetail = description.length > 0 || steps.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-40 flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: closing ? 0 : 1 }}
        transition={{ duration: 0.18 }}
        onClick={requestClose}
      />

      <motion.div
        layoutId={closing ? undefined : `task-${taskRef.id}`}
        animate={closing ? { opacity: 0, scale: 0.94 } : { opacity: 1, scale: 1 }}
        transition={closing ? { duration: 0.16 } : { type: 'spring', stiffness: 420, damping: 42 }}
        className="relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/[0.08] bg-gradient-to-b from-raised to-panel shadow-2xl shadow-black/60"
      >
        {view && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.06, duration: 0.18 } }}
            className="flex min-h-0 flex-col"
          >
            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">
                    {view.kind === 'bounty' ? <Repeat aria-hidden /> : <Swords aria-hidden />}
                    {view.kind === 'bounty' ? 'Contrato diario' : 'Side Quest'}
                  </Badge>
                  {view.campaign && (
                    <Badge>
                      <Flag aria-hidden />
                      {view.campaign}
                    </Badge>
                  )}
                </div>
                <Button
                  ref={closeButton}
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar"
                  onClick={requestClose}
                  className="-mt-2 -mr-2"
                >
                  <X aria-hidden />
                </Button>
              </header>

              <div>
                <h2 id={titleId} className="font-display text-2xl leading-tight font-semibold">
                  {view.task.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-muted">
                    <DifficultyPips value={view.task.difficulty} />
                    {DIFFICULTY_NAMES[view.task.difficulty]}
                  </span>
                  <Badge tone="signal">+{view.xp} XP</Badge>
                  {view.done && (
                    <Badge tone="signal">
                      <Check aria-hidden />
                      {view.kind === 'bounty' ? 'Hecho hoy' : 'Completada'}
                    </Badge>
                  )}
                </div>
              </div>

              {description && <p className="text-[15px] leading-relaxed text-ink/90">{description}</p>}

              {steps.length > 0 && (
                <section aria-label="Objetivos">
                  <SectionLabel>Objetivos</SectionLabel>
                  <ol className="mt-3 flex flex-col gap-2">
                    {steps.map((step, index) => (
                      <li
                        key={step}
                        className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm leading-snug"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-signal/15 font-display text-xs font-bold text-signal">
                          {index + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {!hasDetail && (
                <div className="rounded-2xl border border-dashed border-white/15 p-4 text-sm text-muted">
                  Esta misión aún no tiene detalles.{' '}
                  {ai.hasKey ? 'Deja que Gemini la vuelva concreta.' : 'Agrégalos al editarla.'}
                </div>
              )}

              {ai.hasKey && (
                <Button variant={hasDetail ? 'ghost' : 'outline'} disabled={ai.loading} onClick={() => void ai.run()}>
                  {ai.loading ? (
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: 'linear',
                      }}
                    >
                      <LoaderCircle aria-hidden />
                    </motion.span>
                  ) : (
                    <Sparkles aria-hidden />
                  )}
                  {ai.loading ? 'Escribiendo detalles…' : hasDetail ? 'Regenerar detalles con IA' : 'Detallar con IA'}
                </Button>
              )}
              {ai.error && <p className="text-sm text-ember">{ai.error}</p>}

              <p className="text-xs text-muted">
                {view.kind === 'bounty'
                  ? `Completado ${view.completions} ${view.completions === 1 ? 'vez' : 'veces'} · desde el ${formatDay(view.task.createdDay)}`
                  : view.task.completedDay
                    ? `Completada el ${formatDay(view.task.completedDay)}`
                    : `Creada el ${formatDay(view.task.createdDay)}`}
              </p>
            </div>

            <footer className="flex gap-2 border-t border-white/[0.06] bg-void/40 p-4">
              <Button onClick={() => onEdit(view)} className="flex-1">
                <Pencil aria-hidden />
                Editar
              </Button>
              <Button variant={view.done ? 'secondary' : 'primary'} onClick={() => void toggle()} className="flex-[2] whitespace-nowrap px-3">
                {view.done ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
                {view.done ? 'Deshacer' : `Completar +${view.xp} XP`}
              </Button>
            </footer>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
