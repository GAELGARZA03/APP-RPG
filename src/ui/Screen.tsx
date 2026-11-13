import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Button } from './kit/Button'

/** Pantalla completa sobre las pestañas (mapa, árbol, bitácora), con su propio botón de regreso. */
export function Screen(props: {
  title: string
  eyebrow?: string
  action?: ReactNode
  onClose: () => void
  /** Sin desplazamiento propio: el contenido maneja sus gestos (árbol). */
  fixed?: boolean
  children: ReactNode
}) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="screen-backdrop fixed inset-0 z-30 flex flex-col"
    >
      <header className="mx-auto flex w-full max-w-md shrink-0 items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <Button variant="ghost" size="icon" aria-label="Volver" onClick={props.onClose}>
          <ArrowLeft aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          {props.eyebrow && (
            <p className="truncate font-display text-[11px] font-semibold tracking-wide text-muted uppercase">
              {props.eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-xl leading-tight font-semibold">{props.title}</h1>
        </div>
        {props.action}
      </header>
      <div
        className={
          props.fixed
            ? 'relative min-h-0 flex-1 overflow-hidden'
            : 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)]'
        }
      >
        {props.children}
      </div>
    </motion.div>
  )
}
