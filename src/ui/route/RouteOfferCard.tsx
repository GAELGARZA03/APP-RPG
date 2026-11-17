import { ArrowDown, ArrowUp, Crown, Plus, Route } from 'lucide-react'
import { motion } from 'motion/react'
import { db } from '../../data/appDb'
import { acceptRouteOffer, snoozeRouteOffer, type RouteStep } from '../../data/gameStore'
import { haptic } from '../../platform/haptics'
import { Button } from '../kit/Button'

/** Sugerencia de la ruta para un paso: subir de nivel, darlo por dominado, agregar el siguiente o bajar. */
export function RouteOfferCard({ step }: { step: RouteStep }) {
  const offer = step.offer
  if (!offer) return null
  const percent = step.rate === null ? null : Math.round(step.rate * 100)

  async function accept(action: 'levelUp' | 'levelDown' | 'master' | 'addNext') {
    await acceptRouteOffer(db, step.id, action)
    haptic('unlock')
  }

  return (
    <motion.section
      aria-label={`Sugerencia de la ruta: ${step.title}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-3xl border border-info/40 bg-gradient-to-br from-info/[0.14] via-raised to-panel p-4"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-info uppercase">
        <Route aria-hidden className="size-4" />
        Tu ruta de hábitos
      </p>
      <p className="text-sm leading-relaxed">
        {offer.kind === 'levelDown' ? (
          <>
            «{step.current}» va al {percent} % en las últimas dos semanas. Bajar un nivel a «{offer.previousLevel}» te
            ayuda a no romper la cadena.
          </>
        ) : (
          <>
            ¡«{step.current}» va al {percent} %! Ya es parte de ti.{' '}
            {offer.kind === 'levelUp' ? `Puedes subirlo a «${offer.nextLevel}»` : 'Ya está en su nivel más alto'}
            {offer.canAddNext ? ' o sumar el siguiente hábito de tu ruta.' : '.'}
          </>
        )}
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void snoozeRouteOffer(db, step.id)}>
          Ahora no
        </Button>
        {offer.kind === 'levelDown' && (
          <Button size="sm" variant="primary" onClick={() => void accept('levelDown')}>
            <ArrowDown aria-hidden />
            Bajar un nivel
          </Button>
        )}
        {offer.kind !== 'levelDown' && offer.canAddNext && (
          <Button size="sm" variant="outline" onClick={() => void accept('addNext')}>
            <Plus aria-hidden />
            Sumar el siguiente
          </Button>
        )}
        {offer.kind === 'levelUp' && (
          <Button size="sm" variant="primary" onClick={() => void accept('levelUp')}>
            <ArrowUp aria-hidden />
            Subir de nivel
          </Button>
        )}
        {offer.kind === 'master' && (
          <Button size="sm" variant="primary" onClick={() => void accept('master')}>
            <Crown aria-hidden />
            Dominado
          </Button>
        )}
      </div>
    </motion.section>
  )
}
