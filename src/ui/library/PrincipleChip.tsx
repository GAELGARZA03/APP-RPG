// Etiqueta «Basado en: …» que muestra en qué principio de la biblioteca se basó la IA. Al tocarla, abre el principio.
import { BookMarked, ExternalLink } from 'lucide-react'
import { useId, useState } from 'react'
import { type Evidence, type Principle, SOURCES, findPrinciple } from '../../game/library'
import { Badge } from '../kit/Badge'
import { cn } from '../kit/cn'
import { Sheet, SheetTitle } from '../Sheet'

export const EVIDENCE_LABELS: Record<Evidence, { label: string; tone: 'signal' | 'info' | 'muted' }> = {
  alta: { label: 'Evidencia alta', tone: 'signal' },
  media: { label: 'Evidencia media', tone: 'info' },
  práctica: { label: 'Recomendación práctica', tone: 'muted' },
}

export function PrincipleChip({ id, className }: { id: string | undefined; className?: string }) {
  const principle = findPrinciple(id)
  const [open, setOpen] = useState(false)
  if (!principle) return null
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-white/[0.08] bg-void/50 px-2.5 py-1 text-left text-xs text-muted active:bg-raised',
          className,
        )}
      >
        <BookMarked aria-hidden className="size-3.5 shrink-0 text-signal" />
        <span className="truncate">
          Basado en: <span className="text-ink">{principle.name}</span>
        </span>
      </button>
      {open && <PrincipleSheet principle={principle} onClose={() => setOpen(false)} />}
    </>
  )
}

function PrincipleSheet({ principle, onClose }: { principle: Principle; onClose: () => void }) {
  const titleId = useId()
  return (
    <Sheet labelledBy={titleId} onClose={onClose}>
      <SheetTitle id={titleId} icon={<BookMarked aria-hidden className="size-5 text-signal" />}>
        {principle.name}
      </SheetTitle>
      <PrincipleBody principle={principle} />
    </Sheet>
  )
}

/** Idea, cómo se aplica, nivel de evidencia y fuentes. Se usa en la hoja y en la pantalla Biblioteca. */
export function PrincipleBody({ principle }: { principle: Principle }) {
  const evidence = EVIDENCE_LABELS[principle.evidence]
  return (
    <div className="flex flex-col gap-3 text-sm leading-snug">
      <Badge tone={evidence.tone} className="self-start">
        {evidence.label}
      </Badge>
      <p>{principle.idea}</p>
      <p>
        <span className="block text-xs font-medium text-muted">Cómo lo usa la app</span>
        {principle.apply}
      </p>
      <div>
        <span className="block text-xs font-medium text-muted">Fuentes</span>
        <ul className="mt-1 flex flex-col gap-1.5">
          {principle.sources.map((sourceId) => {
            const source = SOURCES.find((item) => item.id === sourceId)
            if (!source) return null
            return (
              <li key={source.id} className="text-xs text-muted">
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex gap-1 text-ink/90">
                    <span className="underline decoration-white/20 underline-offset-2">{source.citation}</span>
                    <ExternalLink aria-hidden className="mt-0.5 size-3 shrink-0" />
                  </a>
                ) : (
                  source.citation
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
