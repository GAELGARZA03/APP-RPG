// Editor de una misión de la vista previa.
import { type Difficulty, baseXp, questXp } from '../../game/rules'
import { cn } from '../kit/cn'
import { DifficultyPips } from '../kit/controls'
import { ChevronDown, Clock, Network, Skull } from 'lucide-react'
import { useState } from 'react'
import type { DraftItem } from './draft'

const compactField =
  'min-h-11 rounded-xl border border-line bg-void px-3 text-ink outline-none transition-colors focus:border-signal'

export function MissionEditor(props: {
  item: DraftItem
  boss?: boolean
  optional?: boolean
  onChange: (changes: Partial<DraftItem>) => void
}) {
  const { item, boss, optional = true, onChange } = props
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        'rounded-2xl border bg-void/50 p-2.5',
        boss ? 'border-ember/40' : 'border-white/[0.06]',
        !item.include && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        {optional && (
          <input
            type="checkbox"
            checked={item.include}
            onChange={(event) => onChange({ include: event.target.checked })}
            aria-label={`Incluir ${item.title}`}
            className="mt-2.5 size-6 shrink-0 accent-signal"
          />
        )}
        {boss && (
          <span className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-full bg-ember/15 text-ember">
            <Skull aria-hidden className="size-4" />
          </span>
        )}
        {/* Crece con el texto para que los títulos largos se lean completos. */}
        <textarea
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value.replace(/\n/g, ' ') })}
          maxLength={80}
          rows={1}
          aria-label="Nombre de la misión"
          className={cn(compactField, 'min-w-0 flex-1 resize-none py-2 text-sm leading-snug [field-sizing:content]')}
        />
        {/* Tocar cambia la dificultad (1 → 5 y vuelve a 1): más rápido que un menú. */}
        <button
          type="button"
          onClick={() => onChange({ difficulty: ((item.difficulty % 5) + 1) as Difficulty })}
          aria-label={`Dificultad ${item.difficulty} de ${item.title}: toca para cambiarla`}
          className={cn(compactField, 'flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 px-1 py-1')}
        >
          <DifficultyPips value={item.difficulty} />
          <span className="text-[10px] font-semibold text-info tabular-nums">
            {boss ? questXp({ difficulty: item.difficulty, boss }) : baseXp(item.difficulty)} XP
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-1 flex min-h-11 w-full items-center gap-2 px-1 text-left text-xs text-muted"
      >
        {item.estimate && (
          <span className="flex items-center gap-1">
            <Clock aria-hidden className="size-3.5" />
            {item.estimate}
          </span>
        )}
        {item.skill && (
          <span className="flex min-w-0 items-center gap-1">
            <Network aria-hidden className="size-3.5 shrink-0 text-signal" />
            <span className="truncate">{item.skill}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {item.steps.length} objetivos
          <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-1 pb-1 text-sm leading-snug">
          {item.description && <p className="text-ink/90">{item.description}</p>}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted marker:text-signal">
            {item.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {item.why && (
            <p className="text-muted">
              <span className="text-info">Por qué importa: </span>
              {item.why}
            </p>
          )}
          {item.tip && (
            <p className="text-muted">
              <span className="text-info">Consejo: </span>
              {item.tip}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
