import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

/** Superficie de tarjeta: degradado suave y un borde de luz arriba. */
export const cardSurface =
  'rounded-3xl border border-white/[0.06] bg-gradient-to-b from-raised to-panel shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]'

export function SectionLabel({ icon: Icon, id, children }: { icon?: LucideIcon; id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide text-ink uppercase">
      {Icon && <Icon aria-hidden className="size-4 text-signal" />}
      {children}
    </h2>
  )
}

export function Card(props: {
  label?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
  /** Dentro de una hoja: sin superficie propia, solo el contenido. */
  embedded?: boolean
  headingId?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={props.headingId ? undefined : props.label}
      aria-labelledby={props.headingId}
      className={cn(props.embedded ? '' : cn(cardSurface, 'p-4'), props.className)}
    >
      {props.label && (
        <header className="mb-3 flex min-h-9 items-center justify-between gap-2">
          <SectionLabel icon={props.icon} id={props.headingId}>
            {props.label}
          </SectionLabel>
          {props.action}
        </header>
      )}
      {props.children}
    </section>
  )
}
