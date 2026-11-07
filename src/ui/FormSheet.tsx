import { useId, useState, type FormEvent } from 'react'
import { baseXp, type Difficulty } from '../game/rules'
import { Sheet } from './Sheet'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

export interface FormValues {
  title: string
  difficulty: Difficulty
}

export interface FormSheetProps {
  heading: string
  submitLabel: string
  initialTitle?: string
  /** Si se omite, el formulario no pide dificultad (por ejemplo, para campañas). */
  initialDifficulty?: Difficulty
  danger?: { label: string; confirmLabel: string; action: () => Promise<void> }
  onSubmit: (values: FormValues) => Promise<void>
  onClose: () => void
}

/** Hoja inferior para crear o editar. Se cierra con Escape, el botón atrás o al guardar. */
export function FormSheet(props: FormSheetProps) {
  const { heading, submitLabel, initialTitle = '', initialDifficulty, danger, onSubmit, onClose } = props
  const headingId = useId()
  const [title, setTitle] = useState(initialTitle)
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? 2)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (trimmed) void run(() => onSubmit({ title: trimmed, difficulty }))
  }

  return (
    // Al editar no se abre el teclado: el foco queda en la hoja, no en el nombre.
    <Sheet labelledBy={headingId} focusSheet={initialTitle !== ''} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 id={headingId} className="text-sm tracking-widest text-muted">
          {heading.toUpperCase()}
        </h2>

        <label className="flex flex-col gap-1 text-xs text-muted">
          Nombre
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            required
            autoFocus={initialTitle === ''}
            enterKeyHint="done"
            className="min-h-11 rounded-md border border-line bg-void px-3 text-base text-ink outline-none focus:border-signal"
          />
        </label>

        {initialDifficulty !== undefined && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs text-muted">Dificultad</legend>
            <div className="grid grid-cols-5 gap-2">
              {DIFFICULTIES.map((option) => (
                <label
                  key={option}
                  className={`flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-md border text-sm has-focus-visible:outline-2 has-focus-visible:outline-signal ${
                    option === difficulty ? 'border-ember bg-ember/15 text-ember' : 'border-line text-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="difficulty"
                    value={option}
                    checked={option === difficulty}
                    onChange={() => setDifficulty(option)}
                    aria-label={`Dificultad ${option}, ${baseXp(option)} XP`}
                    className="sr-only"
                  />
                  <span className="text-lg font-bold">{option}</span>
                  <span className="text-[10px]">{baseXp(option)} XP</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-md border border-line text-muted"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || title.trim() === ''}
            className="min-h-11 flex-1 rounded-md bg-signal font-bold text-void disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>

        {danger && (
          <button
            type="button"
            disabled={busy}
            onClick={() => (confirming ? void run(danger.action) : setConfirming(true))}
            className={`min-h-11 rounded-md border text-sm ${
              confirming ? 'border-ember bg-ember/15 text-ember' : 'border-line text-muted'
            }`}
          >
            {confirming ? danger.confirmLabel : danger.label}
          </button>
        )}
      </form>
    </Sheet>
  )
}
