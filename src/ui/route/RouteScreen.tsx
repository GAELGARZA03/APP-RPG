// Ruta progresiva de hábitos: escribir los hábitos que quieres, revisar la ruta que propone la IA y seguir el camino.
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Crown,
  KeyRound,
  LoaderCircle,
  Lock,
  Play,
  RotateCcw,
  Route,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { AiError, type CallStatus, type RoutePlan } from '../../ai/gemini'
import { planHabitRoute } from '../../ai/habitRoute'
import { db } from '../../data/appDb'
import { activateNextRouteItem, deleteRoute, getRoute, startRoute, type RouteStep } from '../../data/gameStore'
import type { GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { Button } from '../kit/Button'
import { cn } from '../kit/cn'
import { Field, Textarea } from '../kit/controls'
import { frequencyLabel } from '../notebook/HabitsSheet'
import { Screen } from '../Screen'
import { RouteOfferCard } from './RouteOfferCard'

const IDEA =
  'La ruta avanza según tu constancia real: cuando un hábito ya es parte de ti, sube de nivel o llega el siguiente.'

type Step =
  | { kind: 'write' }
  | { kind: 'thinking'; fast: boolean }
  | { kind: 'failed'; message: string; offerFast: boolean; noKey: boolean }
  | { kind: 'preview'; plan: RoutePlan }

export function RouteScreen({
  today,
  onClose,
  onOpenSettings,
}: {
  today: GameDay
  onClose: () => void
  onOpenSettings: () => void
}) {
  const route = useLiveQuery(() => getRoute(db, today), [today])
  const [rebuilding, setRebuilding] = useState(false)
  if (!route)
    return (
      <Screen title="Ruta de hábitos" onClose={onClose}>
        {null}
      </Screen>
    )

  const building = route.length === 0 || rebuilding
  return (
    <Screen title="Ruta de hábitos" eyebrow="Pocos hábitos a la vez, que crecen contigo" onClose={onClose}>
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-10">
        {building ? (
          <RouteBuilder
            onOpenSettings={onOpenSettings}
            onDone={() => setRebuilding(false)}
            onCancel={route.length > 0 ? () => setRebuilding(false) : undefined}
          />
        ) : (
          <RoutePath route={route} onRebuild={() => setRebuilding(true)} />
        )}
      </div>
    </Screen>
  )
}

function RouteBuilder(props: { onOpenSettings: () => void; onDone: () => void; onCancel?: () => void }) {
  const [wishes, setWishes] = useState('')
  const [context, setContext] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'write' })
  const [status, setStatus] = useState<CallStatus | null>(null)
  const [start, setStart] = useState(2)

  async function plan(fast: boolean) {
    setStep({ kind: 'thinking', fast })
    try {
      const result = await planHabitRoute(wishes, context, { fast, onStatus: setStatus })
      setStart(Math.min(result.habits.length, result.habits.length >= 6 ? 2 : 3))
      setStep({ kind: 'preview', plan: result })
    } catch (error) {
      const aiError = error instanceof AiError ? error : null
      setStep({
        kind: 'failed',
        message: aiError?.message ?? 'No se pudo armar la ruta.',
        offerFast: !fast && Boolean(aiError?.modelRelated),
        noKey: aiError?.kind === 'invalid-key',
      })
    }
  }

  async function begin(result: RoutePlan) {
    await startRoute(db, result.habits, start)
    haptic('unlock')
    props.onDone()
  }

  if (step.kind === 'thinking') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-16 text-info">
        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <LoaderCircle aria-hidden className="size-9" />
        </motion.span>
        <p className="font-display tracking-wide">Trazando tu ruta…</p>
        <p aria-live="polite" className="text-center text-sm text-muted">
          {status?.stage === 'retry' || status?.stage === 'fallback'
            ? status.message
            : step.fast
              ? 'Con el modelo rápido.'
              : 'El entrenador está pensando. Puede tardar hasta un minuto.'}
        </p>
      </div>
    )
  }

  if (step.kind === 'failed') {
    return (
      <>
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-sm">
          {step.noKey ? (
            <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
          ) : (
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
          )}
          <p>{step.noKey ? 'Guarda tu API key de Gemini en Ajustes para armar la ruta.' : step.message}</p>
        </div>
        {step.noKey ? (
          <Button variant="primary" onClick={props.onOpenSettings}>
            Ir a Ajustes
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void plan(false)}>
            <RotateCcw aria-hidden />
            Reintentar
          </Button>
        )}
        {step.offerFast && (
          <Button variant="outline" onClick={() => void plan(true)}>
            <Zap aria-hidden />
            Usar modelo rápido
          </Button>
        )}
        <Button onClick={() => setStep({ kind: 'write' })}>Volver</Button>
      </>
    )
  }

  if (step.kind === 'preview') {
    const { plan: result } = step
    return (
      <>
        {result.intro && (
          <p className="rounded-2xl border border-info/25 bg-info/[0.06] p-3.5 leading-relaxed">{result.intro}</p>
        )}
        <ol className="flex flex-col gap-2">
          {result.habits.map((item, index) => (
            <li
              key={`${index}-${item.title}`}
              className={cn(
                'flex flex-col gap-1.5 rounded-2xl border p-3',
                index < start ? 'border-signal/40 bg-signal/[0.06]' : 'border-white/[0.06] bg-void/50',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-raised text-xs font-bold">
                  {index + 1}
                </span>
                {item.emoji && <span>{item.emoji}</span>}
                {item.title}
                <span className="ml-auto text-xs text-muted">{frequencyLabel(item.frequency)}</span>
              </p>
              <p className="text-sm text-muted">{item.why}</p>
              <p className="text-xs text-ink/80">{item.levels.join(' → ')}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 rounded-2xl bg-raised/60 p-3">
          <p className="text-sm">¿Con cuántos empiezas?</p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3]
              .filter((count) => count <= result.habits.length)
              .map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={start === count}
                  onClick={() => setStart(count)}
                  className={cn(
                    'min-h-11 rounded-xl border font-display font-semibold',
                    start === count
                      ? 'border-signal bg-signal text-on-signal'
                      : 'border-white/[0.08] bg-void/50 text-muted',
                  )}
                >
                  {count}
                </button>
              ))}
          </div>
          <p className="text-xs text-muted">Recomendado: 2 o 3, en su versión mínima. {IDEA}</p>
        </div>
        <Button variant="primary" onClick={() => void begin(result)}>
          <Play aria-hidden />
          Empezar la ruta
        </Button>
        <Button onClick={() => setStep({ kind: 'write' })}>Rehacer</Button>
      </>
    )
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-muted">
        Escribe todos los hábitos que te gustaría tener, aunque sean muchos. La app los ordena y te los da poco a poco,
        empezando por una versión mínima. {IDEA}
      </p>
      <Field label="Hábitos que quieres (uno por línea)">
        <Textarea
          value={wishes}
          onChange={(event) => setWishes(event.target.value)}
          rows={6}
          maxLength={3000}
          placeholder={'Leer\nIr al gimnasio\nMeditar\nDormir antes de las 12\nAprender inglés'}
        />
      </Field>
      <Field label="Contexto (opcional)" hint="Tu horario, tu nivel actual o lo que se te dificulta.">
        <Textarea value={context} onChange={(event) => setContext(event.target.value)} rows={2} maxLength={1000} />
      </Field>
      <Button variant="primary" disabled={!wishes.trim()} onClick={() => void plan(false)}>
        <Route aria-hidden />
        Armar mi ruta
      </Button>
      {props.onCancel && <Button onClick={props.onCancel}>Cancelar</Button>}
    </>
  )
}

function RoutePath({ route, onRebuild }: { route: RouteStep[]; onRebuild: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pending = route.filter((step) => step.status === 'pending')
  return (
    <>
      <p className="text-sm leading-relaxed text-muted">{IDEA}</p>
      {route
        .filter((step) => step.offer)
        .map((step) => (
          <RouteOfferCard key={step.id} step={step} />
        ))}

      <ol className="relative flex flex-col gap-3 pl-6">
        <span aria-hidden className="absolute top-4 bottom-4 left-[11px] w-0.5 rounded-full bg-white/10" />
        {route.map((step) => (
          <li key={step.id} className="relative">
            <span
              aria-hidden
              className={cn(
                'absolute top-3 -left-6 grid size-6 place-items-center rounded-full ring-4 ring-void',
                step.status === 'mastered' && 'bg-gold text-void',
                step.status === 'active' && 'bg-signal text-on-signal shadow-[0_0_14px_-2px_var(--color-signal)]',
                step.status === 'pending' && 'bg-raised text-muted',
              )}
            >
              {step.status === 'mastered' ? (
                <Crown className="size-3.5" />
              ) : step.status === 'active' ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : (
                <Lock className="size-3" />
              )}
            </span>
            <div
              className={cn(
                'flex flex-col gap-1 rounded-2xl border p-3',
                step.status === 'active' ? 'border-signal/30 bg-signal/[0.05]' : 'border-white/[0.06] bg-void/40',
                step.status === 'pending' && 'opacity-70',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                {step.emoji && <span>{step.emoji}</span>}
                {step.title}
                <span className="ml-auto text-[11px] text-muted">
                  {step.status === 'mastered' ? 'Dominado' : step.status === 'active' ? 'En formación' : 'Pendiente'}
                </span>
              </p>
              <p className="text-sm">{step.current}</p>
              <div className="flex gap-1" aria-label={`Nivel ${step.level + 1} de ${step.levels.length}`}>
                {step.levels.map((level, index) => (
                  <span
                    key={level}
                    title={level}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      index <= step.level && step.status !== 'pending' ? 'bg-signal' : 'bg-white/10',
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted">
                {step.status === 'pending'
                  ? step.why
                  : step.rate === null
                    ? 'Midiendo tu constancia: dale unos días.'
                    : `Constancia en las últimas dos semanas: ${Math.round(step.rate * 100)} %`}
                {step.archived ? ' · archivado' : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {pending.length > 0 && (
        <Button variant="outline" onClick={() => void activateNextRouteItem(db)}>
          <Play aria-hidden />
          Empezar ya el siguiente: {pending[0].title}
        </Button>
      )}
      <Button variant="ghost" onClick={onRebuild}>
        <Route aria-hidden />
        Rehacer la ruta (los hábitos activos se quedan)
      </Button>
      <Button
        variant={confirmDelete ? 'danger' : 'ghost'}
        onClick={() => (confirmDelete ? void deleteRoute(db) : setConfirmDelete(true))}
      >
        <Trash2 aria-hidden />
        {confirmDelete ? 'Toca otra vez: se borra la ruta (tus hábitos se quedan)' : 'Borrar la ruta'}
      </Button>
    </>
  )
}
