// Editor de una misión de la vista previa.
import { type Difficulty, baseXp, questXp } from '../../game/rules'
import { cn } from '../kit/cn'
import { ChevronDown, Clock, Network, Skull } from 'lucide-react'
import { useState } from 'react'
import type { DraftItem } from './draft'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

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
        <select
          value={item.difficulty}
          onChange={(event) => onChange({ difficulty: Number(event.target.value) as Difficulty })}
          aria-label={`Dificultad de ${item.title}`}
          className={cn(compactField, 'w-16 shrink-0 px-2 text-sm text-info')}
        >
          {DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficulty} · {boss ? questXp({ difficulty, boss }) : baseXp(difficulty)}
            </option>
          ))}
        </select>
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
