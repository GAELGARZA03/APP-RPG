import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { baseXp, type Difficulty } from '../game/rules'
import { Button } from './kit/Button'
import { cn } from './kit/cn'
import { Field, Input, Textarea } from './kit/controls'
import { Sheet, SheetTitle } from './Sheet'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]
const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  1: 'Menos de 15 minutos',
  2: 'Hasta 30 minutos',
  3: 'Alrededor de una hora',
  4: 'Varias horas o reto',
  5: 'Un día o gran reto',
}

export interface FormValues {
  title: string
  difficulty: Difficulty
  description: string
  steps: string[]
}

export interface FormSheetProps {
  heading: string
  submitLabel: string
  initialTitle?: string
  /** Si se omite, el formulario no pide dificultad (por ejemplo, para campañas). */
  initialDifficulty?: Difficulty
  /** Muestra los campos de descripción y objetivos (misiones, no campañas). */
  withDetails?: boolean
  initialDescription?: string
  initialSteps?: string[]
  danger?: { label: string; confirmLabel: string; action: () => Promise<void> }
  onSubmit: (values: FormValues) => Promise<void>
  onClose: () => void
}

/** Hoja inferior para crear o editar. Se cierra con Escape, el botón atrás o al guardar. */
export function FormSheet(props: FormSheetProps) {
  const { heading, submitLabel, initialTitle = '', initialDifficulty, danger, onSubmit, onClose } = props
  const headingId = useId()
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(props.initialDescription ?? '')
  const [stepsText, setStepsText] = useState((props.initialSteps ?? []).join('\n'))
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
    const steps = stepsText
      .split('\n')
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, 10)
    if (trimmed) void run(() => onSubmit({ title: trimmed, difficulty, description: description.trim(), steps }))
  }

  return (
    // Al editar no se abre el teclado: el foco queda en la hoja, no en el nombre.
    <Sheet labelledBy={headingId} focusSheet={initialTitle !== ''} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SheetTitle id={headingId}>{heading}</SheetTitle>

        <Field label="Nombre">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            required
            autoFocus={initialTitle === ''}
            enterKeyHint="done"
          />
        </Field>

        {props.withDetails && (
          <>
            <Field label="Descripción" hint="Qué hay que hacer y cómo sabrás que terminaste.">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={600} rows={2} />
            </Field>
            <Field label="Objetivos" hint="Uno por línea, con cantidades. Ej.: Practica el swing cut 10 veces.">
              <Textarea value={stepsText} onChange={(event) => setStepsText(event.target.value)} rows={3} />
            </Field>
          </>
        )}

        {initialDifficulty !== undefined && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-medium text-muted">Dificultad</legend>
            <div className="grid grid-cols-5 gap-2">
              {DIFFICULTIES.map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-2xl border transition-colors has-focus-visible:outline-2 has-focus-visible:outline-signal',
                    option === difficulty ? 'border-info bg-info/15 text-info' : 'border-white/[0.06] bg-void/50 text-muted',
                  )}
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
                  <span className="font-display text-xl font-bold">{option}</span>
                  <span className="text-[10px] font-medium">{baseXp(option)} XP</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">{DIFFICULTY_HINTS[difficulty]}</p>
          </fieldset>
        )}

        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || title.trim() === ''} className="flex-1">
            {submitLabel}
          </Button>
        </div>

        {danger && (
          <Button
            variant={confirming ? 'danger' : 'ghost'}
            disabled={busy}
            onClick={() => (confirming ? void run(danger.action) : setConfirming(true))}
          >
            <Trash2 aria-hidden />
            {confirming ? danger.confirmLabel : danger.label}
          </Button>
        )}
      </form>
    </Sheet>
  )
}
