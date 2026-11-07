import type { ReactNode } from 'react'
import type { Difficulty } from '../game/rules'

export function Panel({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs tracking-widest text-muted">{label.toUpperCase()}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DifficultyPips({ value }: { value: Difficulty }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Dificultad ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((pip) => (
        <span key={pip} className={`h-2 w-1.5 ${pip <= value ? 'bg-ember' : 'bg-line'}`} />
      ))}
    </span>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-3 overflow-hidden rounded-sm border border-line bg-void"
    >
      <div
        className="h-full bg-signal transition-[width] duration-500"
        style={{ width: `${max === 0 ? 0 : (value / max) * 100}%` }}
      />
    </div>
  )
}

export function TaskRow(props: {
  title: string
  difficulty: Difficulty
  xp: number
  done: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const { title, difficulty, xp, done, onToggle, onEdit } = props

  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-void/60 py-1 pr-1 pl-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={title}
        onClick={onToggle}
        className={`grid size-11 shrink-0 place-items-center rounded-sm border-2 text-xl font-bold transition-colors ${
          done ? 'border-signal bg-signal text-void' : 'border-line text-transparent active:border-signal'
        }`}
      >
        ✓
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate ${done ? 'text-muted line-through' : ''}`}>{title}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <DifficultyPips value={difficulty} />
          <span>+{xp} XP</span>
        </p>
      </div>
      <button
        type="button"
        aria-label={`Editar ${title}`}
        onClick={onEdit}
        className="grid size-11 shrink-0 place-items-center rounded-sm text-xl text-muted active:bg-line"
      >
        ⋯
      </button>
    </li>
  )
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 w-full rounded-md border border-dashed border-line px-3 text-sm text-muted active:border-signal active:text-signal"
    >
      + {children}
    </button>
  )
}

export function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 rounded-sm border border-line px-3 text-xs text-muted active:border-signal active:text-signal"
    >
      {children}
    </button>
  )
}
