import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { HabitFrequency } from '../data/db'
import { baseXp, type Difficulty } from '../game/rules'
import { Button } from './kit/Button'
import { cn } from './kit/cn'
import { Field, Input, Textarea } from './kit/controls'
import { TimeField } from './kit/TimeField'
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
  /** Solo en hábitos. */
  emoji?: string
  frequency?: HabitFrequency
  /** Hora del recordatorio (HH:MM) o `null` sin recordatorio. */
  reminder?: string | null
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** La hora del recordatorio ya pasó hoy (los avisos solo se programan a futuro). */
function passedToday(time: string): boolean {
  const [hour, minute] = time.split(':').map(Number)
  const now = new Date()
  // Antes de las 4:00 a. m. todavía es el día de juego anterior.
  if (hour < 4) return now.getHours() < 4 && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute
  return now.getHours() >= 4 && now.getHours() * 60 + now.getMinutes() >= hour * 60 + minute
}
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

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
  /** Pide emoji y frecuencia (hábitos). */
  habit?: { emoji?: string; frequency?: HabitFrequency; reminder?: string }
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
  const [emoji, setEmoji] = useState(props.habit?.emoji ?? '')
  const [weekdays, setWeekdays] = useState<number[]>(
    props.habit?.frequency?.kind === 'weekdays' ? props.habit.frequency.days : [],
  )
  const [mode, setMode] = useState<HabitFrequency['kind']>(props.habit?.frequency?.kind ?? 'daily')
  const [times, setTimes] = useState(props.habit?.frequency?.kind === 'timesPerWeek' ? props.habit.frequency.times : 3)
  const [reminder, setReminder] = useState(props.habit?.reminder ?? '')
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
    const habitFields = props.habit
      ? {
          emoji: [...emoji.trim()].slice(0, 2).join(''),
          frequency: (mode === 'timesPerWeek'
            ? { kind: 'timesPerWeek', times }
            : mode === 'weekdays' && weekdays.length > 0
              ? { kind: 'weekdays', days: [...weekdays].sort() }
              : { kind: 'daily' }) as HabitFrequency,
          reminder: /^\d{2}:\d{2}$/.test(reminder) ? reminder : null,
        }
      : {}
    if (trimmed) {
      void run(() => onSubmit({ title: trimmed, difficulty, description: description.trim(), steps, ...habitFields }))
    }
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

        {props.habit && (
          <>
            <Field label="Emoji (opcional)" hint="Se muestra arriba de su columna en la libreta.">
              <Input
                value={emoji}
                onChange={(event) => setEmoji(event.target.value)}
                maxLength={8}
                placeholder="📚"
                className="w-24 text-center text-xl"
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-xs font-medium text-muted">¿Qué días?</legend>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'daily', label: 'Diario' },
                    { value: 'weekdays', label: 'Ciertos días' },
                    { value: 'timesPerWeek', label: 'Veces por semana' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={cn(
                      'min-h-11 rounded-2xl border px-1 text-sm leading-tight',
                      mode === option.value
                        ? 'border-info bg-info/15 text-info'
                        : 'border-white/[0.06] bg-void/50 text-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {mode === 'weekdays' && (
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((letter, index) => (
                    <button
                      key={letter}
                      type="button"
                      aria-pressed={weekdays.includes(index)}
                      aria-label={WEEKDAY_NAMES[index]}
                      onClick={() =>
                        setWeekdays((current) =>
                          current.includes(index) ? current.filter((day) => day !== index) : [...current, index],
                        )
                      }
                      className={cn(
                        'grid aspect-square min-h-10 place-items-center rounded-xl border font-display font-semibold',
                        weekdays.includes(index)
                          ? 'border-signal bg-signal text-on-signal'
                          : 'border-white/[0.08] bg-void/50 text-muted',
                      )}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              )}
              {mode === 'weekdays' && weekdays.length === 0 && (
                <p className="text-xs text-muted">Elige al menos un día.</p>
              )}
              {mode === 'timesPerWeek' && (
                <div className="flex items-center gap-2">
                  <div className="grid flex-1 grid-cols-6 gap-1.5">
                    {[1, 2, 3, 4, 5, 6].map((count) => (
                      <button
                        key={count}
                        type="button"
                        aria-pressed={times === count}
                        aria-label={`${count} ${count === 1 ? 'vez' : 'veces'} por semana`}
                        onClick={() => setTimes(count)}
                        className={cn(
                          'grid aspect-square min-h-10 place-items-center rounded-xl border font-display font-semibold',
                          times === count
                            ? 'border-signal bg-signal text-on-signal'
                            : 'border-white/[0.08] bg-void/50 text-muted',
                        )}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-muted">por semana</span>
                </div>
              )}
            </fieldset>
            <Field
              label="Recordatorio (opcional)"
              hint="Te avisa a esta hora los días que toca, si aún no lo marcaste."
            >
              <TimeField
                label="Recordatorio"
                value={reminder}
                onChange={setReminder}
                onClear={() => setReminder('')}
                placeholder="Sin recordatorio"
              />
              {reminder && passedToday(reminder) && (
                <p className="mt-1 text-xs text-ember">
                  Hoy ya pasó esa hora: el primer aviso llegará el próximo día que toque.
                </p>
              )}
            </Field>
          </>
        )}

        {props.withDetails && (
          <>
            <Field label="Descripción" hint="Qué hay que hacer y cómo sabrás que terminaste.">
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={600}
                rows={2}
              />
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
                    option === difficulty
                      ? 'border-info bg-info/15 text-info'
                      : 'border-white/[0.06] bg-void/50 text-muted',
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
          <Button
            type="submit"
            variant="primary"
            disabled={
              busy || title.trim() === '' || (Boolean(props.habit) && mode === 'weekdays' && weekdays.length === 0)
            }
            className="flex-1"
          >
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
