import { Crown, Lock, LockOpen, Sparkles, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { ActCompletion } from '../data/gameStore'
import { useBack } from './backStack'
import { Button } from './kit/Button'

const RAYS = Array.from({ length: 12 }, (_, index) => index * 30)

/** Celebración al cerrar un acto: trofeo, destellos y el candado del siguiente acto abriéndose. */
export function ActCelebration(props: {
  act: ActCompletion
  onClose: () => void
  /** Abre el mapa de la campaña (donde está el botón para generar el siguiente acto). */
  onContinue: () => void
}) {
  const { act, onClose, onContinue } = props
  const [unlocked, setUnlocked] = useState(false)
  useBack(true, onClose)

  // El candado se abre un momento después, para que se note el cambio.
  useEffect(() => {
    const timer = setTimeout(() => setUnlocked(true), 900)
    return () => clearTimeout(timer)
  }, [])

  const finished = act.next === null

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label={finished ? 'Campaña completada' : `Acto ${act.actNumber} completado`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-signal/40 bg-gradient-to-b from-raised to-panel p-6 text-center shadow-[0_0_80px_-20px_var(--color-signal)]"
      >
        <div className="relative grid size-28 place-items-center">
          {RAYS.map((angle, index) => (
            <motion.span
              key={angle}
              aria-hidden
              className="absolute h-1.5 w-1.5 rounded-full bg-signal"
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: Math.cos((angle * Math.PI) / 180) * 78,
                y: Math.sin((angle * Math.PI) / 180) * 78,
              }}
              transition={{ duration: 1.1, delay: 0.15 + index * 0.02, repeat: Infinity, repeatDelay: 1.4 }}
            />
          ))}
          <motion.div
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
            className="grid size-24 place-items-center rounded-full bg-signal text-on-signal shadow-[0_0_50px_-6px_var(--color-signal)]"
          >
            {finished ? <Crown aria-hidden className="size-12" /> : <Trophy aria-hidden className="size-12" />}
          </motion.div>
        </div>

        <div>
          <p className="font-display text-xs font-semibold tracking-widest text-signal uppercase">
            {finished ? act.campaignTitle : `Acto ${act.actNumber} completado`}
          </p>
          <h2 className="mt-1 font-display text-3xl leading-tight font-bold">
            {finished ? '¡Campaña completada!' : act.actTitle}
          </h2>
          {finished && <p className="mt-2 text-sm text-muted">Derrotaste al jefe y cerraste el último acto.</p>}
        </div>

        {act.next && (
          <div className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-void/60 p-3 text-left">
            <motion.span
              key={String(unlocked)}
              initial={{ scale: 1.6, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              className={
                unlocked
                  ? 'grid size-11 shrink-0 place-items-center rounded-2xl bg-signal/15 text-signal'
                  : 'grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-muted'
              }
            >
              {unlocked ? <LockOpen aria-hidden className="size-5" /> : <Lock aria-hidden className="size-5" />}
            </motion.span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted">
                {unlocked ? 'Desbloqueado' : 'Desbloqueando…'} · Acto {act.next.number}
              </span>
              <span className="block truncate font-display text-lg font-semibold">{act.next.title}</span>
            </span>
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          <Button variant="primary" size="lg" onClick={onContinue}>
            {act.next?.planned && <Sparkles aria-hidden />}
            {act.next?.planned ? `Generar Acto ${act.next.number}` : 'Ver el mapa'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Seguir después
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
